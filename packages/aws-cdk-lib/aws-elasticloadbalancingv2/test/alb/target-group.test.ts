import { testDeprecated } from '@aws-cdk/cdk-build-tools';
import { Match, Template } from '../../../assertions';
import * as ec2 from '../../../aws-ec2';
import * as cdk from '../../../core';
import * as elbv2 from '../../lib';
import { FakeSelfRegisteringTarget } from '../helpers';

describe('tests', () => {
  test('Empty target Group without type still requires a VPC', () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');

    // WHEN
    new elbv2.ApplicationTargetGroup(stack, 'LB', {});

    // THEN
    expect(() => {
      app.synth();
    }).toThrow(/'vpc' is required for a non-Lambda TargetGroup/);
  });

  test('Lambda target should not have stickiness.enabled set', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');

    new elbv2.ApplicationTargetGroup(stack, 'TG', {
      targetType: elbv2.TargetType.LAMBDA,
    });

    const tg = new elbv2.ApplicationTargetGroup(stack, 'TG2');
    tg.addTarget({
      attachToApplicationTargetGroup(_targetGroup: elbv2.IApplicationTargetGroup): elbv2.LoadBalancerTargetProps {
        return {
          targetType: elbv2.TargetType.LAMBDA,
          targetJson: { id: 'arn:aws:lambda:eu-west-1:123456789012:function:myFn' },
        };
      },
    });

    const matches = Template.fromStack(stack).findResources('AWS::ElasticLoadBalancingV2::TargetGroup', {
      TargetGroupAttributes: [
        {
          Key: 'stickiness.enabled',
        },
      ],
    });
    expect(Object.keys(matches).length).toBe(0);
  });

  test('Lambda target should not have port set', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');

    const tg = new elbv2.ApplicationTargetGroup(stack, 'TG2', {
      protocol: elbv2.ApplicationProtocol.HTTPS,
    });
    tg.addTarget({
      attachToApplicationTargetGroup(_targetGroup: elbv2.IApplicationTargetGroup): elbv2.LoadBalancerTargetProps {
        return {
          targetType: elbv2.TargetType.LAMBDA,
          targetJson: { id: 'arn:aws:lambda:eu-west-1:123456789012:function:myFn' },
        };
      },
    });
    expect(() => app.synth()).toThrow(/port\/protocol should not be specified for Lambda targets/);
  });

  test('Lambda target should not have protocol set', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');

    new elbv2.ApplicationTargetGroup(stack, 'TG', {
      port: 443,
      targetType: elbv2.TargetType.LAMBDA,
    });
    expect(() => app.synth()).toThrow(/port\/protocol should not be specified for Lambda targets/);
  });

  test('Can add self-registering target to imported TargetGroup', () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');
    const vpc = new ec2.Vpc(stack, 'Vpc');

    // WHEN
    const tg = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(stack, 'TG', {
      targetGroupArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/myAlbTargetGroup/73e2d6bc24d8a067',
    });
    tg.addTarget(new FakeSelfRegisteringTarget(stack, 'Target', vpc));
  });

  testDeprecated('Cannot add direct target to imported TargetGroup', () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');
    const tg = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(stack, 'TG', {
      targetGroupArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/myAlbTargetGroup/73e2d6bc24d8a067',
    });

    // WHEN
    expect(() => {
      tg.addTarget(new elbv2.InstanceTarget('i-1234'));
    }).toThrow(/Cannot add a non-self registering target to an imported TargetGroup/);
  });

  testDeprecated('HealthCheck fields set if provided', () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');
    const vpc = new ec2.Vpc(stack, 'VPC', {});
    const alb = new elbv2.ApplicationLoadBalancer(stack, 'ALB', { vpc });
    const listener = new elbv2.ApplicationListener(stack, 'Listener', {
      port: 80,
      loadBalancer: alb,
      open: false,
    });

    // WHEN
    const ipTarget = new elbv2.IpTarget('10.10.12.12');
    listener.addTargets('TargetGroup', {
      targets: [ipTarget],
      port: 80,
      healthCheck: {
        enabled: true,
        healthyHttpCodes: '255',
        interval: cdk.Duration.seconds(255),
        timeout: cdk.Duration.seconds(192),
        healthyThresholdCount: 29,
        unhealthyThresholdCount: 27,
        path: '/arbitrary',
      },
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckEnabled: true,
      HealthCheckIntervalSeconds: 255,
      HealthCheckPath: '/arbitrary',
      HealthCheckTimeoutSeconds: 192,
      HealthyThresholdCount: 29,
      Matcher: {
        HttpCode: '255',
      },
      Port: 80,
      UnhealthyThresholdCount: 27,
    });
  });

  test.each([
    elbv2.TargetGroupIpAddressType.IPV4,
    elbv2.TargetGroupIpAddressType.IPV6,
  ])('configure IP address type %s', (ipAddressType) => {
    const stack = new cdk.Stack();
    const vpc = new ec2.Vpc(stack, 'Vpc');

    new elbv2.ApplicationTargetGroup(stack, 'Group', {
      vpc,
      ipAddressType,
    });

    Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      IpAddressType: ipAddressType,
    });
  });

  test('Load balancer duration cookie stickiness', () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');
    const vpc = new ec2.Vpc(stack, 'VPC', {});

    // WHEN
    new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
      stickinessCookieDuration: cdk.Duration.minutes(5),
      vpc,
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      TargetGroupAttributes: [
        {
          Key: 'stickiness.enabled',
          Value: 'true',
        },
        {
          Key: 'stickiness.type',
          Value: 'lb_cookie',
        },
        {
          Key: 'stickiness.lb_cookie.duration_seconds',
          Value: '300',
        },
      ],
    });
  });

  test('Load balancer app cookie stickiness', () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');
    const vpc = new ec2.Vpc(stack, 'VPC', {});

    // WHEN
    new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
      stickinessCookieDuration: cdk.Duration.minutes(5),
      stickinessCookieName: 'MyDeliciousCookie',
      vpc,
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      TargetGroupAttributes: [
        {
          Key: 'stickiness.enabled',
          Value: 'true',
        },
        {
          Key: 'stickiness.type',
          Value: 'app_cookie',
        },
        {
          Key: 'stickiness.app_cookie.cookie_name',
          Value: 'MyDeliciousCookie',
        },
        {
          Key: 'stickiness.app_cookie.duration_seconds',
          Value: '300',
        },
      ],
    });
  });

  test('Custom Load balancer algorithm type', () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');
    const vpc = new ec2.Vpc(stack, 'VPC', {});

    // WHEN
    new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
      loadBalancingAlgorithmType: elbv2.TargetGroupLoadBalancingAlgorithmType.LEAST_OUTSTANDING_REQUESTS,
      vpc,
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      TargetGroupAttributes: [
        {
          Key: 'stickiness.enabled',
          Value: 'false',
        },
        {
          Key: 'load_balancing.algorithm.type',
          Value: 'least_outstanding_requests',
        },
      ],
    });
  });

  test('Can set a protocol version', () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');
    const vpc = new ec2.Vpc(stack, 'VPC', {});

    // WHEN
    new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
      vpc,
      protocolVersion: elbv2.ApplicationProtocolVersion.GRPC,
      healthCheck: {
        enabled: true,
        healthyGrpcCodes: '0-99',
        interval: cdk.Duration.seconds(255),
        timeout: cdk.Duration.seconds(192),
        healthyThresholdCount: 29,
        unhealthyThresholdCount: 27,
        path: '/arbitrary',
      },
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      ProtocolVersion: 'GRPC',
      HealthCheckEnabled: true,
      HealthCheckIntervalSeconds: 255,
      HealthCheckPath: '/arbitrary',
      HealthCheckTimeoutSeconds: 192,
      HealthyThresholdCount: 29,
      Matcher: {
        GrpcCode: '0-99',
      },
      UnhealthyThresholdCount: 27,
    });
  });

  test('Bad stickiness cookie names', () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');
    const vpc = new ec2.Vpc(stack, 'VPC', {});
    const errMessage = 'App cookie names that start with the following prefixes are not allowed: AWSALB, AWSALBAPP, and AWSALBTG; they\'re reserved for use by the load balancer';

    // THEN
    ['AWSALBCookieName', 'AWSALBstickinessCookieName', 'AWSALBTGCookieName'].forEach((badCookieName, i) => {
      expect(() => {
        new elbv2.ApplicationTargetGroup(stack, `TargetGroup${i}`, {
          stickinessCookieDuration: cdk.Duration.minutes(5),
          stickinessCookieName: badCookieName,
          vpc,
        });
      }).toThrow(errMessage);
    });
  });

  test('Empty stickiness cookie name', () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');
    const vpc = new ec2.Vpc(stack, 'VPC', {});

    // THEN
    expect(() => {
      new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
        stickinessCookieDuration: cdk.Duration.minutes(5),
        stickinessCookieName: '',
        vpc,
      });
    }).toThrow(/App cookie name cannot be an empty string./);
  });

  test('Bad stickiness duration value', () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');
    const vpc = new ec2.Vpc(stack, 'VPC', {});

    // THEN
    expect(() => {
      new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
        stickinessCookieDuration: cdk.Duration.days(8),
        vpc,
      });
    }).toThrow(/Stickiness cookie duration value must be between 1 second and 7 days \(604800 seconds\)./);
  });

  test('Bad slow start duration value', () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');
    const vpc = new ec2.Vpc(stack, 'VPC', {});

    // THEN
    [cdk.Duration.minutes(16), cdk.Duration.seconds(29)].forEach((badDuration, i) => {
      expect(() => {
        new elbv2.ApplicationTargetGroup(stack, `TargetGroup${i}`, {
          slowStart: badDuration,
          vpc,
        });
      }).toThrow(/Slow start duration value must be between 30 and 900 seconds, or 0 to disable slow start./);
    });
  });

  test('Disable slow start by setting to 0 seconds', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');
    const vpc = new ec2.Vpc(stack, 'VPC', {});

    // WHEN
    new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
      slowStart: cdk.Duration.seconds(0),
      vpc,
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      TargetGroupAttributes: [
        {
          Key: 'slow_start.duration_seconds',
          Value: '0',
        },
        {
          Key: 'stickiness.enabled',
          Value: 'false',
        },
      ],
    });
  });

  test.each([elbv2.Protocol.UDP, elbv2.Protocol.TCP_UDP, elbv2.Protocol.TLS])(
    'Throws validation error, when `healthCheck` has `protocol` set to %s',
    (protocol) => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');
      const vpc = new ec2.Vpc(stack, 'VPC', {});

      // WHEN
      new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
        vpc,
        healthCheck: {
          protocol: protocol,
        },
      });

      // THEN
      expect(() => {
        app.synth();
      }).toThrow(`Health check protocol '${protocol}' is not supported. Must be one of [HTTP, HTTPS]`);
    });

  test.each([elbv2.Protocol.UDP, elbv2.Protocol.TCP_UDP, elbv2.Protocol.TLS])(
    'Throws validation error, when `configureHealthCheck()` has `protocol` set to %s',
    (protocol) => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');
      const vpc = new ec2.Vpc(stack, 'VPC', {});
      const tg = new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
        vpc,
      });

      // WHEN
      tg.configureHealthCheck({
        protocol: protocol,
      });

      // THEN
      expect(() => {
        app.synth();
      }).toThrow(`Health check protocol '${protocol}' is not supported. Must be one of [HTTP, HTTPS]`);
    });

  test.each([elbv2.Protocol.HTTP, elbv2.Protocol.HTTPS])(
    'Does not throw validation error, when `healthCheck` has `protocol` set to %s',
    (protocol) => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');
      const vpc = new ec2.Vpc(stack, 'VPC', {});

      // WHEN
      new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
        vpc,
        healthCheck: {
          protocol: protocol,
        },
      });

      // THEN
      expect(() => {
        app.synth();
      }).not.toThrow();
    });

  test.each([elbv2.Protocol.HTTP, elbv2.Protocol.HTTPS])(
    'Does not throw validation error, when `configureHealthCheck()` has `protocol` set to %s',
    (protocol) => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');
      const vpc = new ec2.Vpc(stack, 'VPC', {});
      const tg = new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
        vpc,
      });

      // WHEN
      tg.configureHealthCheck({
        protocol: protocol,
      });

      // THEN
      expect(() => {
        app.synth();
      }).not.toThrow();
    });

  test.each([elbv2.Protocol.HTTP, elbv2.Protocol.HTTPS])(
    'Throws validation error, when `healthCheck` has `protocol` set to %s and `interval` is equal to `timeout`',
    (protocol) => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');
      const vpc = new ec2.Vpc(stack, 'VPC', {});

      // WHEN
      new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
        vpc,
        healthCheck: {
          interval: cdk.Duration.seconds(60),
          timeout: cdk.Duration.seconds(60),
          protocol: protocol,
        },
      });

      // THEN
      expect(() => {
        app.synth();
      }).toThrow('Healthcheck interval 1 minute must be greater than the timeout 1 minute');
    });

  test.each([elbv2.Protocol.HTTP, elbv2.Protocol.HTTPS])(
    'Throws validation error, when `healthCheck` has `protocol` set to %s and `interval` is smaller than `timeout`',
    (protocol) => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');
      const vpc = new ec2.Vpc(stack, 'VPC', {});

      // WHEN
      new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
        vpc,
        healthCheck: {
          interval: cdk.Duration.seconds(60),
          timeout: cdk.Duration.seconds(120),
          protocol: protocol,
        },
      });

      // THEN
      expect(() => {
        app.synth();
      }).toThrow('Healthcheck interval 1 minute must be greater than the timeout 2 minutes');
    });

  test.each([elbv2.Protocol.HTTP, elbv2.Protocol.HTTPS])(
    'Throws validation error, when `configureHealthCheck()` has `protocol` set to %s and `interval` is equal to `timeout`',
    (protocol) => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');
      const vpc = new ec2.Vpc(stack, 'VPC', {});
      const tg = new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
        vpc,
      });

      // WHEN
      tg.configureHealthCheck({
        interval: cdk.Duration.seconds(60),
        timeout: cdk.Duration.seconds(60),
        protocol: protocol,
      });

      // THEN
      expect(() => {
        app.synth();
      }).toThrow('Healthcheck interval 1 minute must be greater than the timeout 1 minute');
    });

  test.each([elbv2.Protocol.HTTP, elbv2.Protocol.HTTPS])(
    'Throws validation error, when `configureHealthCheck()` has `protocol` set to %s and `interval` is smaller than `timeout`',
    (protocol) => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');
      const vpc = new ec2.Vpc(stack, 'VPC', {});
      const tg = new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
        vpc,
      });

      // WHEN
      tg.configureHealthCheck({
        interval: cdk.Duration.seconds(60),
        timeout: cdk.Duration.seconds(120),
        protocol: protocol,
      });

      // THEN
      expect(() => {
        app.synth();
      }).toThrow('Healthcheck interval 1 minute must be greater than the timeout 2 minutes');
    });

  test('Throws validation error, when `configureHealthCheck()`protocol is undefined and `interval` is smaller than `timeout`', () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');
    const vpc = new ec2.Vpc(stack, 'VPC', {});
    const tg = new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
      vpc,
    });

    // WHEN
    tg.configureHealthCheck({
      interval: cdk.Duration.seconds(60),
      timeout: cdk.Duration.seconds(120),
    });

    // THEN
    expect(() => {
      app.synth();
    }).toThrow('Healthcheck interval 1 minute must be greater than the timeout 2 minute');
  });

  test('Throws error for health check interval less than timeout', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');
    const vpc = new ec2.Vpc(stack, 'Vpc');

    new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
      vpc,
      port: 80,
      healthCheck: {
        interval: cdk.Duration.seconds(10),
        timeout: cdk.Duration.seconds(20),
      },
    });

    expect(() => {
      app.synth();
    }).toThrow('Health check interval must be greater than or equal to the timeout; received interval 10, timeout 20.');
  });

  // for backwards compatibility these can be equal, see discussion in https://github.com/aws/aws-cdk/pull/26031
  test('Throws error for health check interval less than timeout', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');
    const vpc = new ec2.Vpc(stack, 'Vpc');

    new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
      vpc,
      port: 80,
      healthCheck: {
        interval: cdk.Duration.seconds(10),
        timeout: cdk.Duration.seconds(20),
      },
    });

    expect(() => {
      app.synth();
    }).toThrow('Health check interval must be greater than or equal to the timeout; received interval 10, timeout 20.');
  });

  test('imported targetGroup has targetGroupName', () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');

    // WHEN
    const importedTg = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(stack, 'importedTg', {
      targetGroupArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/myAlbTargetGroup/73e2d6bc24d8a067',
    });

    // THEN
    expect(importedTg.targetGroupName).toEqual('myAlbTargetGroup');
  });

  test('imported targetGroup with imported ARN has targetGroupName', () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');

    // WHEN
    const importedTgArn = cdk.Fn.importValue('ImportTargetGroupArn');
    const importedTg = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(stack, 'importedTg', {
      targetGroupArn: importedTgArn,
    });
    new cdk.CfnOutput(stack, 'TargetGroupOutput', {
      value: importedTg.targetGroupName,
    });

    // THEN
    Template.fromStack(stack).hasOutput('TargetGroupOutput', {
      Value: {
        'Fn::Select': [
          // myAlbTargetGroup
          1,
          {
            'Fn::Split': [
              // [targetgroup, myAlbTargetGroup, 73e2d6bc24d8a067]
              '/',
              {
                'Fn::Select': [
                  // targetgroup/myAlbTargetGroup/73e2d6bc24d8a067
                  5,
                  {
                    'Fn::Split': [
                      // [arn, aws, elasticloadbalancing, us-west-2, 123456789012, targetgroup/myAlbTargetGroup/73e2d6bc24d8a067]
                      ':',
                      {
                        // arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/myAlbTargetGroup/73e2d6bc24d8a067
                        'Fn::ImportValue': 'ImportTargetGroupArn',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  test('imported targetGroup has metrics', () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');

    // WHEN
    const targetGroup = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(stack, 'importedTg', {
      targetGroupArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/my-target-group/50dc6c495c0c9188',
      loadBalancerArns: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:loadbalancer/app/my-load-balancer/73e2d6bc24d8a067',
    });

    const metric = targetGroup.metrics.custom('MetricName');

    // THEN
    expect(metric.namespace).toEqual('AWS/ApplicationELB');
    expect(stack.resolve(metric.dimensions)).toEqual({
      LoadBalancer: 'app/my-load-balancer/73e2d6bc24d8a067',
      TargetGroup: 'targetgroup/my-target-group/50dc6c495c0c9188',
    });
  });

  test('imported targetGroup without load balancer cannot have metrics', () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack');

    // WHEN
    const targetGroup = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(stack, 'importedTg', {
      targetGroupArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/my-target-group/50dc6c495c0c9188',
    });

    expect(() => targetGroup.metrics.custom('MetricName')).toThrow();
  });

  describe('weighted_random algorithm test', () => {
    test('weight_random algorithm and anomaly mitigation is enabled', () => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');
      const vpc = new ec2.Vpc(stack, 'VPC', {});

      // WHEN
      new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
        loadBalancingAlgorithmType: elbv2.TargetGroupLoadBalancingAlgorithmType.WEIGHTED_RANDOM,
        vpc,
        enableAnomalyMitigation: true,
      });

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
        TargetGroupAttributes: [
          {
            Key: 'stickiness.enabled',
            Value: 'false',
          },
          {
            Key: 'load_balancing.algorithm.type',
            Value: 'weighted_random',
          },
          {
            Key: 'load_balancing.algorithm.anomaly_mitigation',
            Value: 'on',
          },
        ],
      });
    });

    test('weight_random algorithm and anomaly mitigation is disabled', () => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');
      const vpc = new ec2.Vpc(stack, 'VPC', {});

      // WHEN
      new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
        loadBalancingAlgorithmType: elbv2.TargetGroupLoadBalancingAlgorithmType.WEIGHTED_RANDOM,
        vpc,
        enableAnomalyMitigation: false,
      });

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
        TargetGroupAttributes: [
          {
            Key: 'stickiness.enabled',
            Value: 'false',
          },
          {
            Key: 'load_balancing.algorithm.type',
            Value: 'weighted_random',
          },
          {
            Key: 'load_balancing.algorithm.anomaly_mitigation',
            Value: 'off',
          },
        ],
      });
    });

    test('Throws an error when weight_random algorithm is set with slow start setting', () => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');
      const vpc = new ec2.Vpc(stack, 'VPC', {});

      // WHEN
      expect(() => new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
        loadBalancingAlgorithmType: elbv2.TargetGroupLoadBalancingAlgorithmType.WEIGHTED_RANDOM,
        slowStart: cdk.Duration.seconds(60),
        vpc,
      }),
      ).toThrow('The weighted random routing algorithm can not be used with slow start mode.');
    });

    test('Throws an error when anomaly mitigation is enabled with an algorithm other than weight_random', () => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');
      const vpc = new ec2.Vpc(stack, 'VPC', {});

      // WHEN
      expect(() => new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
        loadBalancingAlgorithmType: elbv2.TargetGroupLoadBalancingAlgorithmType.ROUND_ROBIN,
        enableAnomalyMitigation: true,
        vpc,
      }),
      ).toThrow('Anomaly mitigation is only available when `loadBalancingAlgorithmType` is `TargetGroupLoadBalancingAlgorithmType.WEIGHTED_RANDOM`.');
    });
  });

  // test cases for crossZoneEnabled
  describe('crossZoneEnabled', () => {
    test.each([true, false])('crossZoneEnabled can be %s', (crossZoneEnabled) => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');
      const vpc = new ec2.Vpc(stack, 'VPC', {});

      // WHEN
      new elbv2.ApplicationTargetGroup(stack, 'LB', { crossZoneEnabled, vpc });

      Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
        TargetGroupAttributes: [
          {
            Key: 'load_balancing.cross_zone.enabled',
            Value: `${crossZoneEnabled}`,
          },
          {
            Key: 'stickiness.enabled',
            Value: 'false',
          },
        ],
      });
    });

    test('load_balancing.cross_zone.enabled is not set when crossZoneEnabled is not specified', () => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');
      const vpc = new ec2.Vpc(stack, 'VPC', {});

      // WHEN
      new elbv2.ApplicationTargetGroup(stack, 'LB', { vpc, targetType: elbv2.TargetType.LAMBDA });

      Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
        TargetGroupAttributes: Match.absent(),
      });
    });
  });

  describe('Lambda target multi_value_headers tests', () => {
    test('Lambda target should have multi_value_headers.enabled set to true when enabled', () => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');

      // WHEN
      new elbv2.ApplicationTargetGroup(stack, 'TG', {
        targetType: elbv2.TargetType.LAMBDA,
        multiValueHeadersEnabled: true,
      });

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
        TargetType: 'lambda',
        TargetGroupAttributes: [
          {
            Key: 'lambda.multi_value_headers.enabled',
            Value: 'true',
          },
        ],
      });
    });

    test.each([false, undefined])('lambda.multi_value_headers.enabled is not set when multiValueHeadersEnabled is %s', (multiValueHeadersEnabled) => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');
      // WHEN
      new elbv2.ApplicationTargetGroup(stack, 'TG', {
        targetType: elbv2.TargetType.LAMBDA,
        multiValueHeadersEnabled,
      });
      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
        TargetType: 'lambda',
        TargetGroupAttributes: Match.absent(),
      });
    });

    test('Lambda target with addTarget should preserve multi_value_headers.enabled as true', () => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');

      // WHEN
      const tg = new elbv2.ApplicationTargetGroup(stack, 'TG', {
        targetType: elbv2.TargetType.LAMBDA,
        multiValueHeadersEnabled: true,
      });

      tg.addTarget({
        attachToApplicationTargetGroup(_targetGroup: elbv2.IApplicationTargetGroup): elbv2.LoadBalancerTargetProps {
          return {
            targetType: elbv2.TargetType.LAMBDA,
            targetJson: { id: 'arn:aws:lambda:eu-west-1:123456789012:function:myFn' },
          };
        },
      });

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
        TargetType: 'lambda',
        TargetGroupAttributes: [
          {
            Key: 'lambda.multi_value_headers.enabled',
            Value: 'true',
          },
        ],
        Targets: [{ Id: 'arn:aws:lambda:eu-west-1:123456789012:function:myFn' }],
      });
    });

    test('lambda.multi_value_headers.enabled is not set with addTarget when multiValueHeadersEnabled is false', () => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');

      // WHEN
      const tg = new elbv2.ApplicationTargetGroup(stack, 'TG', {
        targetType: elbv2.TargetType.LAMBDA,
        multiValueHeadersEnabled: false,
      });

      tg.addTarget({
        attachToApplicationTargetGroup(_targetGroup: elbv2.IApplicationTargetGroup): elbv2.LoadBalancerTargetProps {
          return {
            targetType: elbv2.TargetType.LAMBDA,
            targetJson: { id: 'arn:aws:lambda:eu-west-1:123456789012:function:myFn' },
          };
        },
      });

      // THEN
      Template.fromStack(stack).hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
        TargetType: 'lambda',
        TargetGroupAttributes: Match.absent(),
        Targets: [{ Id: 'arn:aws:lambda:eu-west-1:123456789012:function:myFn' }],
      });
    });
  });

  describe('multiValueHeadersEnabled validation', () => {
    test.each([elbv2.TargetType.IP, elbv2.TargetType.INSTANCE])('Throws an error when multiValueHeadersEnabled is true for non-Lambda target type (%s)', (targetType) => {
      // GIVEN
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack');
      const vpc = new ec2.Vpc(stack, 'VPC');
      // WHEN & THEN
      expect(() => new elbv2.ApplicationTargetGroup(stack, 'TargetGroup', {
        vpc,
        targetType,
        multiValueHeadersEnabled: true,
      })).toThrow('multiValueHeadersEnabled is only supported for Lambda targets.');
    });
  });
});
