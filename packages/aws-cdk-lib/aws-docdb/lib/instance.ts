import { Construct } from 'constructs';
import { IDatabaseCluster } from './cluster-ref';
import { CfnDBInstance } from './docdb.generated';
import { Endpoint } from './endpoint';
import * as ec2 from '../../aws-ec2';
import { CaCertificate } from '../../aws-rds';
import { ArnFormat } from '../../core';
import * as cdk from '../../core';
import { addConstructMetadata } from '../../core/lib/metadata-resource';
import { propertyInjectable } from '../../core/lib/prop-injectable';

/**
 * A database instance
 */
export interface IDatabaseInstance extends cdk.IResource {
  /**
   * The instance identifier.
   */
  readonly instanceIdentifier: string;

  /**
   * The instance arn.
   */
  readonly instanceArn: string;

  /**
   * The instance endpoint address.
   *
   * @attribute Endpoint
   */
  readonly dbInstanceEndpointAddress: string;

  /**
   * The instance endpoint port.
   *
   * @attribute Port
   */
  readonly dbInstanceEndpointPort: string;

  /**
   * The instance endpoint.
   */
  readonly instanceEndpoint: Endpoint;
}

/**
 * Properties that describe an existing instance
 */
export interface DatabaseInstanceAttributes {
  /**
   * The instance identifier.
   */
  readonly instanceIdentifier: string;

  /**
   * The endpoint address.
   */
  readonly instanceEndpointAddress: string;

  /**
   * The database port.
   */
  readonly port: number;
}

/**
 * A new or imported database instance.
 */
abstract class DatabaseInstanceBase extends cdk.Resource implements IDatabaseInstance {
  /**
   * Import an existing database instance.
   */
  public static fromDatabaseInstanceAttributes(scope: Construct, id: string, attrs: DatabaseInstanceAttributes): IDatabaseInstance {
    class Import extends DatabaseInstanceBase implements IDatabaseInstance {
      public readonly defaultPort = ec2.Port.tcp(attrs.port);
      public readonly instanceIdentifier = attrs.instanceIdentifier;
      public readonly dbInstanceEndpointAddress = attrs.instanceEndpointAddress;
      public readonly dbInstanceEndpointPort = attrs.port.toString();
      public readonly instanceEndpoint = new Endpoint(attrs.instanceEndpointAddress, attrs.port);
    }

    return new Import(scope, id);
  }

  /**
   * @inheritdoc
   */
  public abstract readonly instanceIdentifier: string;
  /**
   * @inheritdoc
   */
  public abstract readonly dbInstanceEndpointAddress: string;
  /**
   * @inheritdoc
   */
  public abstract readonly dbInstanceEndpointPort: string;
  /**
   * @inheritdoc
   */
  public abstract readonly instanceEndpoint: Endpoint;

  /**
   * The instance arn.
   */
  public get instanceArn(): string {
    return cdk.Stack.of(this).formatArn({
      service: 'rds',
      resource: 'db',
      arnFormat: ArnFormat.COLON_RESOURCE_NAME,
      resourceName: this.instanceIdentifier,
    });
  }
}

/**
 * Construction properties for a DatabaseInstanceNew
 */
export interface DatabaseInstanceProps {
  /**
   * The DocumentDB database cluster the instance should launch into.
   */
  readonly cluster: IDatabaseCluster;

  /**
   * The name of the compute and memory capacity classes.
   */
  readonly instanceType: ec2.InstanceType;

  /**
   * The name of the Availability Zone where the DB instance will be located.
   *
   * @default - no preference
   */
  readonly availabilityZone?: string;

  /**
   * A name for the DB instance. If you specify a name, AWS CloudFormation
   * converts it to lowercase.
   *
   * @default - a CloudFormation generated name
   */
  readonly dbInstanceName?: string;

  /**
   * Indicates that minor engine upgrades are applied automatically to the
   * DB instance during the maintenance window.
   *
   * @default true
   */
  readonly autoMinorVersionUpgrade?: boolean;

  /**
   * The weekly time range (in UTC) during which system maintenance can occur.
   *
   * Format: `ddd:hh24:mi-ddd:hh24:mi`
   * Constraint: Minimum 30-minute window
   *
   * @default - a 30-minute window selected at random from an 8-hour block of
   * time for each AWS Region, occurring on a random day of the week. To see
   * the time blocks available, see https://docs.aws.amazon.com/documentdb/latest/developerguide/db-instance-maintain.html#maintenance-window
   */
  readonly preferredMaintenanceWindow?: string;

  /**
   * The CloudFormation policy to apply when the instance is removed from the
   * stack or replaced during an update.
   *
   * @default RemovalPolicy.Retain
   */
  readonly removalPolicy?: cdk.RemovalPolicy;

  /**
   * A value that indicates whether to enable Performance Insights for the DB Instance.
   *
   * @default - false
   */
  readonly enablePerformanceInsights?: boolean;

  /**
   * The identifier of the CA certificate for this DB instance.
   *
   * Specifying or updating this property triggers a reboot.
   *
   * @see https://docs.aws.amazon.com/documentdb/latest/developerguide/ca_cert_rotation.html
   *
   * @default - DocumentDB will choose a certificate authority
   */
  readonly caCertificate?: CaCertificate;
}

/**
 * A database instance
 *
 * @resource AWS::DocDB::DBInstance
 */
@propertyInjectable
export class DatabaseInstance extends DatabaseInstanceBase implements IDatabaseInstance {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = 'aws-cdk-lib.aws-docdb.DatabaseInstance';
  /**
   * The instance's database cluster
   */
  public readonly cluster: IDatabaseCluster;

  /**
   * @inheritdoc
   */
  public readonly instanceIdentifier: string;

  /**
   * @inheritdoc
   */
  public readonly dbInstanceEndpointAddress: string;

  /**
   * @inheritdoc
   */
  public readonly dbInstanceEndpointPort: string;

  /**
   * @inheritdoc
   */
  public readonly instanceEndpoint: Endpoint;

  constructor(scope: Construct, id: string, props: DatabaseInstanceProps) {
    super(scope, id);
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    const instance = new CfnDBInstance(this, 'Resource', {
      dbClusterIdentifier: props.cluster.clusterIdentifier,
      dbInstanceClass: `db.${props.instanceType}`,
      autoMinorVersionUpgrade: props.autoMinorVersionUpgrade ?? true,
      availabilityZone: props.availabilityZone,
      caCertificateIdentifier: props.caCertificate ? props.caCertificate.toString() : undefined,
      dbInstanceIdentifier: props.dbInstanceName,
      preferredMaintenanceWindow: props.preferredMaintenanceWindow,
      enablePerformanceInsights: props.enablePerformanceInsights,
    });

    this.cluster = props.cluster;
    this.instanceIdentifier = instance.ref;
    this.dbInstanceEndpointAddress = instance.attrEndpoint;
    this.dbInstanceEndpointPort = instance.attrPort;

    // create a number token that represents the port of the instance
    const portAttribute = cdk.Token.asNumber(instance.attrPort);
    this.instanceEndpoint = new Endpoint(instance.attrEndpoint, portAttribute);

    instance.applyRemovalPolicy(props.removalPolicy, {
      applyToUpdateReplacePolicy: true,
    });
  }
}
