import {
  Destination,
  GoogleCloudPubSubDestination
} from '@commercetools/platform-sdk';
import { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';

const APPROVAL_FLOW_NOTIFICATION_SUBSCRIPTION_KEY =
  'approval-flow-notification';

export async function createGcpPubSubApprovalFlowNotificationSubscription(
  apiRoot: ByProjectKeyRequestBuilder,
  topicName: string,
  projectId: string
): Promise<void> {
  const destination: GoogleCloudPubSubDestination = {
    type: 'GoogleCloudPubSub',
    topic: topicName,
    projectId,
  };
  await createSubscription(apiRoot, destination);
}

async function createSubscription(
  apiRoot: ByProjectKeyRequestBuilder,
  destination: Destination
) {
  await deleteApprovalFlowNotificationSubscription(apiRoot);
  await apiRoot
    .subscriptions()
    .post({
      body: {
        key: APPROVAL_FLOW_NOTIFICATION_SUBSCRIPTION_KEY,
        destination,
        messages: [
          {
            resourceTypeId: 'approval-flow',
            types: ['ApprovalFlowCreated', 'ApprovalFlowApproved', 'ApprovalFlowRejected', 'ApprovalFlowCompleted'],
          },
        ],
      },
    })
    .execute();
}

export async function deleteApprovalFlowNotificationSubscription(
  apiRoot: ByProjectKeyRequestBuilder
): Promise<void> {
  const {
    body: { results: subscriptions },
  } = await apiRoot
    .subscriptions()
    .get({
      queryArgs: {
        where: `key = "${APPROVAL_FLOW_NOTIFICATION_SUBSCRIPTION_KEY}"`,
      },
    })
    .execute();

  if (subscriptions.length > 0) {
    const subscription = subscriptions[0];

    await apiRoot
      .subscriptions()
      .withKey({ key: APPROVAL_FLOW_NOTIFICATION_SUBSCRIPTION_KEY })
      .delete({
        queryArgs: {
          version: subscription.version,
        },
      })
      .execute();
  }
}
