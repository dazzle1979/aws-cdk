import { Construct } from 'constructs';
import { IQueue } from './queue-base';
import { CfnQueuePolicy } from './sqs.generated';
import { PolicyDocument } from '../../aws-iam';
import { Resource } from '../../core';
import { ValidationError } from '../../core/lib/errors';
import { addConstructMetadata } from '../../core/lib/metadata-resource';
import { propertyInjectable } from '../../core/lib/prop-injectable';

/**
 * Properties to associate SQS queues with a policy
 */
export interface QueuePolicyProps {
  /**
   * The set of queues this policy applies to.
   */
  readonly queues: IQueue[];
}

/**
 * The policy for an SQS Queue
 *
 * Policies define the operations that are allowed on this resource.
 *
 * You almost never need to define this construct directly.
 *
 * All AWS resources that support resource policies have a method called
 * `addToResourcePolicy()`, which will automatically create a new resource
 * policy if one doesn't exist yet, otherwise it will add to the existing
 * policy.
 *
 * Prefer to use `addToResourcePolicy()` instead.
 */
@propertyInjectable
export class QueuePolicy extends Resource {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = 'aws-cdk-lib.aws-sqs.QueuePolicy';
  /**
   * The IAM policy document for this policy.
   */
  public readonly document = new PolicyDocument();

  constructor(scope: Construct, id: string, props: QueuePolicyProps) {
    super(scope, id);
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    new CfnQueuePolicy(this, 'Resource', {
      policyDocument: this.document,
      queues: props.queues.map(q => q.queueUrl),
    });
  }

  /**
   * Not currently supported by AWS CloudFormation.
   *
   * This attribute temporarily existed in CloudFormation, and then was removed again.
   *
   * @attribute
   */
  public get queuePolicyId(): string {
    throw new ValidationError('QueuePolicy.queuePolicyId has been removed from CloudFormation', this);
  }
}
