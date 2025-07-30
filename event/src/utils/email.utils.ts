import {MailService} from '@sendgrid/mail';
import { readConfiguration } from './config.utils';
import { logger } from './logger.utils';
import CustomError from '../errors/custom.error';

/**
 * Initialize SendGrid with API key
 */
const initializeSendGrid = () => {
  const config = readConfiguration();
  const sgMail = new MailService();
  sgMail.setApiKey(config.sendgridApiKey);
  return sgMail;
};

/**
 * Send email using SendGrid
 */
export const sendEmail = async (
  to: string,
  subject: string,
  text: string,
  html?: string
): Promise<void> => {
  logger.debug(`Preparing to send email to: ${to}`);
  logger.debug('Email details:', { subject, textLength: text.length });
  
  try {
    logger.debug('Initializing SendGrid...');
    const sgMail = initializeSendGrid();
    const config = readConfiguration();

    const msg = {
      to,
      from: config.sendgridFromEmail,
      subject,
      text,
      html: html || text.replace(/\n/g, '<br>'),
    };

    logger.debug('Email message prepared:', {
      to: msg.to,
      from: msg.from,
      subject: msg.subject,
      hasHtml: !!msg.html
    });

    logger.debug('Sending email via SendGrid...');
    await sgMail.send(msg);
    logger.info(`Email sent successfully to ${to}`);
  } catch (error) {
    logger.error(`Failed to send email to ${to}:`, error);
    logger.error('Email context:', { to, subject });
    throw new CustomError(500, `Failed to send email: ${error}`);
  }
};

/**
 * Send bulk emails to multiple recipients
 */
export const sendBulkEmails = async (
  recipients: Array<{ email: string; name: string }>,
  subject: string,
  getTextContent: (name: string) => string,
  getHtmlContent?: (name: string) => string
): Promise<void> => {
  logger.info(`Starting bulk email send to ${recipients.length} recipients`);
  logger.debug('Recipients list:', recipients.map(r => ({ email: r.email, name: r.name })));
  logger.debug('Email subject:', subject);
  
  try {
    logger.debug('Creating email promises for parallel sending...');
    const emailPromises = recipients.map((recipient, index) => {
      logger.debug(`Preparing email ${index + 1}/${recipients.length} for ${recipient.email}`);
      return sendEmail(
        recipient.email,
        subject,
        getTextContent(recipient.name),
        getHtmlContent ? getHtmlContent(recipient.name) : undefined
      );
    });

    logger.info(`Sending ${emailPromises.length} emails in parallel...`);
    await Promise.all(emailPromises);
    logger.info(`Bulk emails sent successfully to ${recipients.length} recipients`);
  } catch (error) {
    logger.error('Failed to send bulk emails:', error);
    logger.error('Bulk email context:', { 
      recipientCount: recipients.length, 
      subject,
      recipients: recipients.map(r => r.email)
    });
    throw new CustomError(500, `Failed to send bulk emails: ${error}`);
  }
};