import { Request, Response } from 'express';
import CustomError from '../errors/custom.error';
import { logger } from '../utils/logger.utils';
import { 
  handleApprovalFlowCreated,
  handleApprovalFlowApproved,
  handleApprovalFlowRejectedOrCompleted
} from '../utils/approval.utils';

/**
 * Validates the incoming Pub/Sub message structure
 */
const validatePubSubMessage = (request: Request) => {
  if (!request.body) {
    logger.error('Missing request body.');
    throw new CustomError(400, 'Bad request: No Pub/Sub message was received');
  }

  if (!request.body.message) {
    logger.error('Missing body message');
    throw new CustomError(400, 'Bad request: Wrong No Pub/Sub message format');
  }

  return request.body.message;
};

/**
 * Decodes and parses the Pub/Sub message data
 */
const decodePubSubMessage = (pubSubMessage: any) => {
  logger.info('Decoding Pub/Sub message data');
  
  const decodedData = pubSubMessage.data
    ? Buffer.from(pubSubMessage.data, 'base64').toString().trim()
    : undefined;

  logger.debug('Decoded data length:', decodedData?.length || 0);

  if (!decodedData) {
    logger.error('No message data found in Pub/Sub message');
    throw new CustomError(400, 'Bad request: No message data found');
  }

  try {
    const jsonData = JSON.parse(decodedData);
    logger.info('Successfully parsed message data:', {
      notificationType: jsonData.notificationType,
      type: jsonData.type,
      resourceType: jsonData.resource?.typeId,
      resourceId: jsonData.resource?.id
    });
    return jsonData;
  } catch (error) {
    logger.error('Failed to parse message data:', error);
    logger.error('Raw decoded data:', decodedData);
    throw new CustomError(400, 'Bad request: Invalid JSON in message data');
  }
};

/**
 * Routes the message to the appropriate handler based on notification type
 */
const routeApprovalFlowMessage = async (jsonData: any) => {
  const { type } = jsonData;

  logger.info(`Processing notification type: ${type}`);
  logger.debug('Full message data structure:', JSON.stringify(jsonData, null, 2));

  switch (type) {
    case 'ResourceCreated':
      logger.info('Skipping ResourceCreated notification - no processing needed');
      throw new CustomError(
        202,
        'Incoming message is about subscription resource creation. Skip handling the message.'
      );

    case 'ApprovalFlowCreated':
      logger.info('Handling ApprovalFlowCreated notification');
      if (!jsonData.approvalFlow) {
        logger.error('ApprovalFlow data missing in ApprovalFlowCreated message');
        throw new CustomError(400, 'ApprovalFlow data missing in message');
      }
      logger.debug('ApprovalFlow data:', {
        id: jsonData.approvalFlow.id,
        businessUnitKey: jsonData.approvalFlow.businessUnit?.key,
        orderId: jsonData.approvalFlow.order?.id,
        pendingApproversCount: jsonData.approvalFlow.currentTierPendingApprovers?.length || 0
      });
      await handleApprovalFlowCreated(jsonData.approvalFlow);
      logger.info('Successfully processed ApprovalFlowCreated notification');
      break;

    case 'ApprovalFlowApproved':
      logger.info('Handling ApprovalFlowApproved notification');
      if (!jsonData.resource?.id) {
        logger.error('Approval flow ID missing in ApprovalFlowApproved message');
        throw new CustomError(400, 'Approval flow ID missing in message');
      }
      logger.debug('ApprovalFlowApproved data:', {
        approvalFlowId: jsonData.resource.id,
        associateId: jsonData.associate?.id,
        orderId: jsonData.order?.id
      });
      await handleApprovalFlowApproved(jsonData.resource.id, jsonData.associate.id, jsonData.order.id);
      logger.info('Successfully processed ApprovalFlowApproved notification');
      break;

    case 'ApprovalFlowRejected':
      logger.info('Handling ApprovalFlowRejected notification');
      if (!jsonData.resource?.id) {
        logger.error('Approval flow ID missing in ApprovalFlowRejected message');
        throw new CustomError(400, 'Approval flow ID missing in message');
      }
      logger.debug('ApprovalFlowRejected data:', {
        approvalFlowId: jsonData.resource.id,
        orderId: jsonData.order?.id
      });
      await handleApprovalFlowRejectedOrCompleted(jsonData.resource.id, true, jsonData.order.id);
      logger.info('Successfully processed ApprovalFlowRejected notification');
      break;

    case 'ApprovalFlowCompleted':
      logger.info('Handling ApprovalFlowCompleted notification');
      if (!jsonData.resource?.id) {
        logger.error('Approval flow ID missing in ApprovalFlowCompleted message');
        throw new CustomError(400, 'Approval flow ID missing in message');
      }
      logger.debug('ApprovalFlowCompleted data:', {
        approvalFlowId: jsonData.resource.id,
        orderId: jsonData.order?.id
      });
      await handleApprovalFlowRejectedOrCompleted(jsonData.resource.id, false, jsonData.order.id);
      logger.info('Successfully processed ApprovalFlowCompleted notification');
      break;

    default:
      logger.warn(`Unhandled notification type: ${type}`);
      logger.debug('Available notification types: ResourceCreated, ApprovalFlowCreated, ApprovalFlowApproved, ApprovalFlowRejected, ApprovalFlowCompleted');
      throw new CustomError(400, `Unsupported notification type: ${type}`);
  }
};

/**
 * Exposed event POST endpoint.
 * Receives the Pub/Sub message and processes approval flow notifications
 *
 * @param {Request} request The express request
 * @param {Response} response The express response
 */
export const post = async (request: Request, response: Response) => {
  const startTime = Date.now();
  logger.info('=== Starting approval flow message processing ===');
  
  try {
    // Validate and extract the Pub/Sub message
    logger.info('Step 1: Validating Pub/Sub message structure');
    const pubSubMessage = validatePubSubMessage(request);
    logger.info('Pub/Sub message validation successful');
    
    // Decode and parse the message data
    logger.info('Step 2: Decoding and parsing message data');
    const jsonData = decodePubSubMessage(pubSubMessage);
    logger.info('Message data parsing successful');
    logger.debug('Message data:' + JSON.stringify(jsonData, null, 2));
    
    // Route to the appropriate approval flow handler
    logger.info('Step 3: Routing to approval flow handler');
    await routeApprovalFlowMessage(jsonData);
    logger.info('Approval flow handler completed successfully');
    
    // Return success response
    const processingTime = Date.now() - startTime;
    logger.info(`=== Message processing completed successfully in ${processingTime}ms ===`);
    response.status(204).send();
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error(`=== Message processing failed after ${processingTime}ms ===`);
    logger.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      statusCode: error instanceof CustomError ? error.statusCode : 500
    });
    
    // Re-throw the error to be handled by error middleware
    throw error;
  }
};
