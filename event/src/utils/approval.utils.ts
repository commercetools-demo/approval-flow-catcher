import { createApiRoot } from '../client/create.client';
import { readConfiguration } from './config.utils';
import { logger } from './logger.utils';
import CustomError from '../errors/custom.error';
import { sendBulkEmails } from './email.utils';
import {
  getApprovalNotificationTemplate,
  getApprovalNotificationSubject,
} from '../templates/approval-notification.template';
import {
  ApprovalFlow,
  Customer,
  CustomerReference,
  RuleApprover,
} from '@commercetools/platform-sdk';

/**
 * Fetch approval flow by ID
 */
export const fetchApprovalFlow = async (
  approvalFlowId: string,
  associateId: string,
  businessUnitKey: string
) => {
  logger.info(`Fetching approval flow: ${approvalFlowId}`);
  logger.debug('Fetch parameters:', { approvalFlowId, associateId, businessUnitKey });
  
  try {
    logger.debug('Making API call to fetch approval flow...');
    const response = await createApiRoot()
      .asAssociate()
      .withAssociateIdValue({ associateId: associateId })
      .inBusinessUnitKeyWithBusinessUnitKeyValue({
        businessUnitKey: businessUnitKey,
      })
      .approvalFlows()
      .withId({ ID: approvalFlowId })
      .get()
      .execute();

    logger.info(`Successfully fetched approval flow: ${approvalFlowId}`);
    logger.debug('Approval flow details:', {
      id: response.body.id,
      status: response.body.status,
      businessUnitKey: response.body.businessUnit?.key,
      orderId: response.body.order?.id,
      pendingApproversCount: response.body.currentTierPendingApprovers?.length || 0
    });
    return response.body;
  } catch (error) {
    logger.error(`Failed to fetch approval flow ${approvalFlowId}:`, error);
    logger.error('API call details:', { approvalFlowId, associateId, businessUnitKey });
    throw new CustomError(400, `Failed to fetch approval flow: ${error}`);
  }
};

/**
 * Fetch customer by ID
 */
export const fetchCustomer = async (customerId: string) => {
  logger.info(`Fetching customer: ${customerId}`);
  
  try {
    logger.debug('Making API call to fetch customer...');
    const response = await createApiRoot()
      .customers()
      .withId({ ID: customerId })
      .get()
      .execute();

    logger.info(`Successfully fetched customer: ${customerId}`);
    logger.debug('Customer details:', {
      id: response.body.id,
      email: response.body.email,
      firstName: response.body.firstName,
      lastName: response.body.lastName
    });
    return response.body;
  } catch (error) {
    logger.error(`Failed to fetch customer ${customerId}:`, error);
    throw new CustomError(400, `Failed to fetch customer: ${error}`);
  }
};

/**
 * Fetch customers by associate role IDs
 */
export const fetchCustomersByAssociateRoleKeysInBusinessUnit = async (
  associateRoleKeys: string[],
  businessUnitKey: string
): Promise<Customer[]> => {
  logger.info(`Fetching customers for associate roles in business unit: ${businessUnitKey}`);
  logger.debug('Associate role keys:', associateRoleKeys);
  
  try {
    const customers: CustomerReference[] = [];

    logger.debug(`Processing ${associateRoleKeys.length} associate role keys...`);
    for (const roleKey of associateRoleKeys) {
      logger.debug(`Processing associate role: ${roleKey}`);
      
      // First fetch the associate role to get customer references
      logger.debug('Fetching associate role details...');
      const associateRoleResponse = await createApiRoot()
        .associateRoles()
        .withKey({ key: roleKey })
        .get()
        .execute();

      const associateRole = associateRoleResponse.body;
      logger.debug(`Associate role details:`, {
        key: associateRole.key,
        name: associateRole.name,
        buyerAssignable: associateRole.buyerAssignable
      });

      logger.debug('Fetching business unit details...');
      const businessUnitResponse = await createApiRoot()
        .businessUnits()
        .withKey({ key: businessUnitKey })
        .get()
        .execute();

      const businessUnit = businessUnitResponse.body;
      logger.debug(`Business unit has ${businessUnit.associates.length} associates`);

      const assocciates = businessUnit.associates.filter((associate) =>
        associate.associateRoleAssignments.some(
          (assignment) => assignment.associateRole.key === roleKey
        )
      );

      logger.debug(`Found ${assocciates.length} associates with role ${roleKey}`);

      const roleCustomers = assocciates.map((associate) => associate.customer);
      logger.debug(`Extracted ${roleCustomers.length} customer references for role ${roleKey}`);

      customers.push(...roleCustomers);
    }

    logger.info(`Total customer references collected: ${customers.length}`);

    if (customers.length === 0) {
      logger.warn('No customers found for any of the associate roles');
      return [];
    }

    const customerIds = customers.map((customer) => `"${customer.id}"`);
    logger.debug('Customer IDs to fetch:', customerIds);

    logger.debug('Fetching customer details...');
    const customerResponse = await createApiRoot()
      .customers()
      .get({
        queryArgs: {
          where: `id in (${customerIds.join(',')})`,
        },
      })
      .execute();

    logger.info(`Successfully fetched ${customerResponse.body.results.length} customers for associate roles`);
    logger.debug('Customer emails found:', customerResponse.body.results.map(c => c.email).filter(Boolean));
    
    return customerResponse.body.results;
  } catch (error) {
    logger.error('Failed to fetch customers by associate role keys:', error);
    logger.error('Error context:', { associateRoleKeys, businessUnitKey });
    throw new CustomError(400, `Failed to fetch customers: ${error}`);
  }
};

/**
 * Fetch order by ID
 */
export const fetchOrder = async (orderId: string) => {
  logger.info(`Fetching order: ${orderId}`);
  
  try {
    logger.debug('Making API call to fetch order...');
    const response = await createApiRoot()
      .orders()
      .withId({ ID: orderId })
      .get()
      .execute();

    logger.info(`Successfully fetched order: ${orderId}`);
    logger.debug('Order details:', {
      id: response.body.id,
      orderNumber: response.body.orderNumber,
      orderState: response.body.orderState,
      businessUnitKey: response.body.businessUnit?.key,
      totalPrice: response.body.totalPrice?.centAmount,
      version: response.body.version
    });
    return response.body;
  } catch (error) {
    logger.error(`Failed to fetch order ${orderId}:`, error);
    throw new CustomError(400, `Failed to fetch order: ${error}`);
  }
};

/**
 * Transition order state
 */
export const transitionOrderState = async (
  orderId: string,
  stateKey: string
) => {
  logger.info(`Transitioning order ${orderId} to state: ${stateKey}`);
  
  try {
    // First get the current order to get its version
    logger.debug('Fetching current order to get version...');
    const order = await fetchOrder(orderId);
    logger.debug(`Current order version: ${order.version}, current state: ${order.orderState}`);

    // Find the state by key
    logger.debug(`Looking up state with key: ${stateKey}`);
    const stateResponse = await createApiRoot()
      .states()
      .get({
        queryArgs: {
          where: `key="${stateKey}"`,
        },
      })
      .execute();

    logger.debug(`Found ${stateResponse.body.results.length} states matching key "${stateKey}"`);

    if (stateResponse.body.results.length === 0) {
      logger.error(`State with key "${stateKey}" not found`);
      throw new CustomError(400, `State with key "${stateKey}" not found`);
    }

    const targetState = stateResponse.body.results[0];
    logger.debug('Target state details:', {
      id: targetState.id,
      key: targetState.key,
      type: targetState.type,
      name: targetState.name
    });

    // Update the order with transition state action
    logger.debug('Executing order state transition...');
    const updateRequest = {
      version: order.version,
      actions: [
        {
          action: 'transitionState' as const,
          state: {
            typeId: 'state' as const,
            id: targetState.id,
          },
        },
      ],
    };
    logger.debug('Update request:', updateRequest);

    const response = await createApiRoot()
      .orders()
      .withId({ ID: orderId })
      .post({
        body: updateRequest,
      })
      .execute();

    logger.info(`Successfully transitioned order ${orderId} to state ${stateKey}`);
    logger.debug('Updated order state:', response.body.orderState);
    return response.body;
  } catch (error) {
    logger.error(
      `Failed to transition order ${orderId} to state ${stateKey}:`,
      error
    );
    logger.error('Transition context:', { orderId, stateKey });
    throw new CustomError(400, `Failed to transition order state: ${error}`);
  }
};

/**
 * Send approval notification emails
 */
export const sendApprovalNotifications = async (
  customers: Customer[],
  approvalFlowId: string
) => {
  logger.info(`Preparing to send approval notifications for flow: ${approvalFlowId}`);
  logger.debug(`Processing ${customers.length} customers for notifications`);
  
  try {
    const recipients = customers
      .filter((customer) => customer.email)
      .map((customer) => ({
        email: customer.email,
        name: customer.firstName || customer.lastName || customer.email,
      }));

    logger.debug('Customer processing results:', {
      totalCustomers: customers.length,
      customersWithEmail: recipients.length,
      customersWithoutEmail: customers.length - recipients.length
    });

    if (recipients.length === 0) {
      logger.warn('No customers with valid email addresses found');
      logger.debug('Customers without emails:', customers.map(c => ({ id: c.id, firstName: c.firstName, lastName: c.lastName })));
      return;
    }

    logger.debug('Recipients for notifications:', recipients);

    logger.info(`Sending notifications to ${recipients.length} recipients...`);
    await sendBulkEmails(
      recipients,
      getApprovalNotificationSubject(approvalFlowId),
      (name: string) => getApprovalNotificationTemplate(name, approvalFlowId)
    );

    logger.info(
      `Successfully sent approval notifications for flow ${approvalFlowId} to ${recipients.length} recipients`
    );
  } catch (error) {
    logger.error(
      `Failed to send approval notifications for flow ${approvalFlowId}:`,
      error
    );
    logger.error('Notification context:', { approvalFlowId, customerCount: customers.length });
    throw new CustomError(
      500,
      `Failed to send approval notifications: ${error}`
    );
  }
};

/**
 * Handle approval flow created
 */
export const handleApprovalFlowCreated = async (approvalFlow: ApprovalFlow) => {
  logger.info(`=== Handling ApprovalFlowCreated for flow: ${approvalFlow.id} ===`);
  
  try {
    const config = readConfiguration();
    logger.debug('Configuration loaded successfully');

    // Get the approval flow details
    const currentTierPendingApprovers: RuleApprover[] =
      approvalFlow.currentTierPendingApprovers || [];

    logger.debug('Approval flow details:', {
      id: approvalFlow.id,
      businessUnitKey: approvalFlow.businessUnit?.key,
      orderId: approvalFlow.order?.id,
      pendingApproversCount: currentTierPendingApprovers.length,
      status: approvalFlow.status
    });

    if (currentTierPendingApprovers.length === 0) {
      logger.warn('No pending approvers found in approval flow - skipping notification');
      return;
    }

    // Extract associate role IDs from pending approvers
    const associateRoleKeys = currentTierPendingApprovers.map(
      (approver) => approver.associateRole.key
    );
    const businessUnitKey = approvalFlow.businessUnit.key;

    logger.debug('Processing approvers:', {
      associateRoleKeys,
      businessUnitKey
    });

    // Fetch customers by associate role IDs
    logger.info('Step 1: Fetching customers for pending approvers...');
    const customers = await fetchCustomersByAssociateRoleKeysInBusinessUnit(
      associateRoleKeys,
      businessUnitKey
    );

    // Send notifications
    logger.info('Step 2: Sending approval notifications...');
    await sendApprovalNotifications(customers, approvalFlow.id);

    // Find and transition the order
    logger.info('Step 3: Transitioning order state...');
    const orderId = approvalFlow.order?.id;
    if (orderId) {
      logger.debug(`Transitioning order ${orderId} to state: ${config.orderNeedApprovalStateKey}`);
      await transitionOrderState(orderId, config.orderNeedApprovalStateKey);
    } else {
      logger.warn('No order ID found in approval flow - skipping order state transition');
    }

    logger.info(
      `=== Successfully completed ApprovalFlowCreated handling for flow: ${approvalFlow.id} ===`
    );
  } catch (error) {
    logger.error(`=== Failed to handle ApprovalFlowCreated for flow: ${approvalFlow.id} ===`);
    logger.error('Error details:', error);
    throw error;
  }
};

/**
 * Handle approval flow approved
 */
export const handleApprovalFlowApproved = async (approvalFlowId: string, associateId: string, orderId: string) => {
  logger.info(`=== Handling ApprovalFlowApproved for flow: ${approvalFlowId} ===`);
  logger.debug('Handler parameters:', { approvalFlowId, associateId, orderId });
  
  try {
    logger.info('Step 1: Fetching order to get business unit context...');
    const order = await fetchOrder(orderId);
    const businessUnitKey = order.businessUnit?.key;

    if (!businessUnitKey) {
      logger.warn('No business unit key found in order - cannot proceed');
      logger.debug('Order structure:', { id: order.id, businessUnit: order.businessUnit });
      return;
    }

    logger.debug(`Business unit key extracted: ${businessUnitKey}`);

    // Fetch the approval flow
    logger.info('Step 2: Fetching approval flow details...');
    const approvalFlow = await fetchApprovalFlow(approvalFlowId, associateId, businessUnitKey);

    // Get pending approvers and send notifications
    const currentTierPendingApprovers =
      approvalFlow.currentTierPendingApprovers || [];

    logger.debug(`Found ${currentTierPendingApprovers.length} pending approvers`);

    if (currentTierPendingApprovers.length > 0) {
      logger.info('Step 3: Processing pending approvers for notifications...');
      
      const associateRoleKeys = currentTierPendingApprovers.map(
        (approver: any) => approver.associateRole.key
      );
      const businessUnitKey = approvalFlow.businessUnit.key;

      logger.debug('Approver role keys:', associateRoleKeys);

      logger.info('Step 4: Fetching customer details...');
      const customers = await fetchCustomersByAssociateRoleKeysInBusinessUnit(
        associateRoleKeys,
        businessUnitKey
      );
      
      logger.info('Step 5: Sending approval notifications...');
      await sendApprovalNotifications(customers, approvalFlowId);
    } else {
      logger.info('No pending approvers - skipping notifications');
    }

    logger.info(
      `=== Successfully completed ApprovalFlowApproved handling for flow: ${approvalFlowId} ===`
    );
  } catch (error) {
    logger.error(`=== Failed to handle ApprovalFlowApproved for flow: ${approvalFlowId} ===`);
    logger.error('Error details:', error);
    logger.error('Context:', { approvalFlowId, associateId, orderId });
    throw error;
  }
};

/**
 * Handle approval flow rejected or completed
 */
export const handleApprovalFlowRejectedOrCompleted = async (
  approvalFlowId: string,
  isRejected: boolean,
  orderId: string
) => {
  const action = isRejected ? 'rejected' : 'completed';
  logger.info(`=== Handling ApprovalFlow${action} for flow: ${approvalFlowId} ===`);
  logger.debug('Handler parameters:', { approvalFlowId, isRejected, orderId });
  
  try {
    logger.info('Step 1: Loading configuration...');
    const config = readConfiguration();
    logger.debug('Configuration loaded successfully');

    if (orderId) {
      const stateKey = isRejected
        ? config.orderRejectedStateKey
        : config.orderApprovedStateKey;

      logger.info(`Step 2: Transitioning order ${orderId} to ${action} state...`);
      logger.debug('State transition details:', {
        orderId,
        targetStateKey: stateKey,
        isRejected
      });

      await transitionOrderState(orderId, stateKey);
      logger.info(`Order state transition completed successfully`);
    } else {
      logger.warn('No order ID provided - skipping order state transition');
    }

    logger.info(
      `=== Successfully completed ApprovalFlow${action} handling for flow: ${approvalFlowId} ===`
    );
  } catch (error) {
    logger.error(
      `=== Failed to handle ApprovalFlow${action} for flow: ${approvalFlowId} ===`
    );
    logger.error('Error details:', error);
    logger.error('Context:', { approvalFlowId, isRejected, orderId });
    throw error;
  }
};
