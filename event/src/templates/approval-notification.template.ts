/**
 * Email template for approval flow notifications
 */
export const getApprovalNotificationTemplate = (approverName: string, approvalFlowId: string): string => {
  return `Hi ${approverName},

An approval flow with ID ${approvalFlowId} is created.

Check it out in the admin portal.

Best regards,
Your Commerce Team`;
};

/**
 * Email subject for approval flow notifications
 */
export const getApprovalNotificationSubject = (approvalFlowId: string): string => {
  return `New Approval Flow ${approvalFlowId} Requires Your Attention`;
};