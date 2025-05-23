import { Construct } from 'constructs';
import { CfnRealtimeLogConfig } from './cloudfront.generated';
import { Endpoint } from '../';
import { IResource, Lazy, Names, Resource, ValidationError } from '../../core';
import { addConstructMetadata } from '../../core/lib/metadata-resource';
import { propertyInjectable } from '../../core/lib/prop-injectable';

/**
 * Represents Realtime Log Configuration
 */
export interface IRealtimeLogConfig extends IResource {
  /**
   * The name of the realtime log config.
   * @attribute
   */
  readonly realtimeLogConfigName: string;
  /**
   * The arn of the realtime log config.
   * @attribute
   */
  readonly realtimeLogConfigArn: string;
}

/**
 * Properties for defining a RealtimeLogConfig resource.
 */
export interface RealtimeLogConfigProps {
  /**
   * The unique name of this real-time log configuration.
   *
   * @default - the unique construct ID
   */
  readonly realtimeLogConfigName?: string;
  /**
   * A list of fields that are included in each real-time log record.
   *
   * @see https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/real-time-logs.html#understand-real-time-log-config-fields
   */
  readonly fields: string[];
  /**
   * The sampling rate for this real-time log configuration.
   */
  readonly samplingRate: number;
  /**
   * Contains information about the Amazon Kinesis data stream where you are sending real-time log data for this real-time log configuration.
   */
  readonly endPoints: Endpoint[];
}

/**
 * A Realtime Log Config configuration
 *
 * @resource AWS::CloudFront::RealtimeLogConfig
 */
@propertyInjectable
export class RealtimeLogConfig extends Resource implements IRealtimeLogConfig {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = 'aws-cdk-lib.aws-cloudfront.RealtimeLogConfig';
  public readonly realtimeLogConfigName: string;
  public readonly realtimeLogConfigArn: string;

  constructor(scope: Construct, id: string, props: RealtimeLogConfigProps) {
    super(scope, id, {
      physicalName: props.realtimeLogConfigName ?? Lazy.string({ produce: () => Names.uniqueResourceName(this, {}) }),
    });
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    if ((props.samplingRate < 1 || props.samplingRate > 100)) {
      throw new ValidationError(`Sampling rate must be between 1 and 100 (inclusive), received ${props.samplingRate}`, scope);
    }

    const resource = new CfnRealtimeLogConfig(this, 'Resource', {
      endPoints: props.endPoints.map(endpoint => {
        return endpoint._renderEndpoint(this);
      }),
      fields: props.fields,
      name: this.physicalName,
      samplingRate: props.samplingRate,
    });

    this.realtimeLogConfigArn = this.getResourceArnAttribute(resource.attrArn, {
      service: 'cloudfront',
      region: '',
      resource: 'realtime-log-config',
      resourceName: this.physicalName,
    });

    this.realtimeLogConfigName = this.getResourceNameAttribute(resource.ref);
  }
}
