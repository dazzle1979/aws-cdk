/* eslint-disable-next-line import/no-unresolved */
import type * as AWSLambda from 'aws-lambda';

const mockExecuteStatement = jest.fn(async () => ({ Id: 'statementId' }));
jest.mock('@aws-sdk/client-redshift-data', () => ({
  RedshiftData: class {
    executeStatement = mockExecuteStatement;
    describeStatement = jest.fn(async () => ({ Status: 'FINISHED' }));
  },
}));

import { Column, ColumnEncoding, TableDistStyle, TableSortStyle } from '../../lib';
import { handler as manageTable } from '../../lib/private/database-query-provider/table';
import { TableAndClusterProps } from '../../lib/private/database-query-provider/types';

type ResourcePropertiesType = TableAndClusterProps & { ServiceToken: string };

const tableNamePrefix = 'tableNamePrefix';
const tableColumns = [{ name: 'col1', dataType: 'varchar(1)' }];
const clusterName = 'clusterName';
const adminUserArn = 'adminUserArn';
const databaseName = 'databaseName';
const physicalResourceId = 'clusterName:databaseName:tableNamePrefix:111111111111';
const stackId = 'arn:aws:cloudformation:us-east-1:788445345501:stack/aws-cdk-redshift-cluster-database/e782bf70-b8f4-11ed-8c6a-111111111111';
const stackIdTruncated = '111111111111';
const resourceProperties: ResourcePropertiesType = {
  useColumnIds: true,
  tableName: {
    prefix: tableNamePrefix,
    generateSuffix: 'true',
  },
  tableColumns,
  sortStyle: TableSortStyle.AUTO,
  clusterName,
  adminUserArn,
  databaseName,
  ServiceToken: '',
};
const requestId = 'requestId';
const genericEvent: AWSLambda.CloudFormationCustomResourceEventCommon = {
  ResourceProperties: resourceProperties,
  ServiceToken: '',
  ResponseURL: '',
  StackId: stackId,
  RequestId: requestId,
  LogicalResourceId: '',
  ResourceType: '',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('create', () => {
  const baseEvent: AWSLambda.CloudFormationCustomResourceCreateEvent = {
    RequestType: 'Create',
    ...genericEvent,
  };

  test('serializes properties in statement and creates physical resource ID', async () => {
    const event = baseEvent;

    await expect(manageTable(resourceProperties, event)).resolves.toEqual({
      PhysicalResourceId: 'clusterName:databaseName:tableNamePrefix111111111111:111111111111',
    });
    expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
      Sql: `CREATE TABLE ${tableNamePrefix}${stackIdTruncated} (col1 varchar(1))`,
    }));
  });

  test('does not modify table name if no suffix generation requested', async () => {
    const event = baseEvent;
    const newResourceProperties = {
      ...resourceProperties,
      tableName: {
        ...resourceProperties.tableName,
        generateSuffix: 'false',
      },
    };

    await expect(manageTable(newResourceProperties, event)).resolves.toEqual({
      PhysicalResourceId: 'clusterName:databaseName:tableNamePrefix:111111111111',
    });
    expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
      Sql: `CREATE TABLE ${tableNamePrefix} (col1 varchar(1))`,
    }));
  });

  test('serializes distKey and distStyle in statement', async () => {
    const event = baseEvent;
    const newResourceProperties: ResourcePropertiesType = {
      ...resourceProperties,
      tableColumns: [{ name: 'col1', dataType: 'varchar(1)', distKey: true }],
      distStyle: TableDistStyle.KEY,
    };

    await manageTable(newResourceProperties, event);

    expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
      Sql: `CREATE TABLE ${tableNamePrefix}${stackIdTruncated} (col1 varchar(1)) DISTSTYLE KEY DISTKEY(col1)`,
    }));
  });

  test('serializes sortKeys and sortStyle in statement', async () => {
    const event = baseEvent;
    const newResourceProperties: ResourcePropertiesType = {
      ...resourceProperties,
      tableColumns: [
        { name: 'col1', dataType: 'varchar(1)', sortKey: true },
        { name: 'col2', dataType: 'varchar(1)' },
        { name: 'col3', dataType: 'varchar(1)', sortKey: true },
      ],
      sortStyle: TableSortStyle.COMPOUND,
    };

    await manageTable(newResourceProperties, event);

    expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
      Sql: `CREATE TABLE ${tableNamePrefix}${stackIdTruncated} (col1 varchar(1),col2 varchar(1),col3 varchar(1)) COMPOUND SORTKEY(col1,col3)`,
    }));
  });

  test('serializes distKey and sortKeys as string booleans', async () => {
    const event = baseEvent;
    const newResourceProperties: ResourcePropertiesType = {
      ...resourceProperties,
      tableColumns: [
        { name: 'col1', dataType: 'varchar(4)', distKey: 'true' as unknown as boolean },
        { name: 'col2', dataType: 'float', sortKey: 'true' as unknown as boolean },
        { name: 'col3', dataType: 'float', sortKey: 'true' as unknown as boolean },
      ],
      distStyle: TableDistStyle.KEY,
      sortStyle: TableSortStyle.COMPOUND,
    };

    await manageTable(newResourceProperties, event);

    expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
      Sql: `CREATE TABLE ${tableNamePrefix}${stackIdTruncated} (col1 varchar(4),col2 float,col3 float) DISTSTYLE KEY DISTKEY(col1) COMPOUND SORTKEY(col2,col3)`,
    }));
  });

  test('serializes table comment in statement', async () => {
    const event = baseEvent;
    const newResourceProperties: ResourcePropertiesType = {
      ...resourceProperties,
      tableComment: 'table comment',
    };

    await manageTable(newResourceProperties, event);

    expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
      Sql: `COMMENT ON TABLE ${tableNamePrefix}${stackIdTruncated} IS 'table comment'`,
    }));
  });
});

describe('delete', () => {
  const baseEvent: AWSLambda.CloudFormationCustomResourceDeleteEvent = {
    RequestType: 'Delete',
    PhysicalResourceId: physicalResourceId,
    ...genericEvent,
  };

  test('executes statement', async () => {
    const event = baseEvent;

    await manageTable(resourceProperties, event);

    expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
      Sql: `DROP TABLE ${tableNamePrefix}${stackIdTruncated}`,
    }));
  });
});

describe('update', () => {
  const event: AWSLambda.CloudFormationCustomResourceUpdateEvent = {
    RequestType: 'Update',
    OldResourceProperties: resourceProperties,
    PhysicalResourceId: physicalResourceId,
    ...genericEvent,
  };

  test('replaces if cluster name changes', async () => {
    const newClusterName = 'newClusterName';
    const newResourceProperties = {
      ...resourceProperties,
      clusterName: newClusterName,
    };

    await expect(manageTable(newResourceProperties, event)).resolves.toMatchObject({
      PhysicalResourceId: physicalResourceId,
    });
    expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
      ClusterIdentifier: newClusterName,
      Sql: expect.stringMatching(new RegExp(`CREATE TABLE ${tableNamePrefix}${stackIdTruncated}`)),
    }));
  });

  test('does not replace if admin user ARN changes', async () => {
    const newAdminUserArn = 'newAdminUserArn';
    const newResourceProperties = {
      ...resourceProperties,
      adminUserArn: newAdminUserArn,
    };

    await expect(manageTable(newResourceProperties, event)).resolves.toMatchObject({
      PhysicalResourceId: physicalResourceId,
    });
    expect(mockExecuteStatement).not.toHaveBeenCalled();
  });

  test('replaces if database name changes', async () => {
    const newDatabaseName = 'newDatabaseName';
    const newResourceProperties = {
      ...resourceProperties,
      databaseName: newDatabaseName,
    };

    await expect(manageTable(newResourceProperties, event)).resolves.toMatchObject({
      PhysicalResourceId: physicalResourceId,
    });
    expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
      Database: newDatabaseName,
      Sql: expect.stringMatching(new RegExp(`CREATE TABLE ${tableNamePrefix}${stackIdTruncated}`)),
    }));
  });

  describe('table name', () => {
    test('does not replace if PhysicalResourceId is old format', async () => {
      const newResourceProperties = {
        ...resourceProperties,
        PhysicalResourceId: 'newTableName',
        tableName: {
          ...resourceProperties.tableName,
          prefix: 'newTableName',
          generateSuffix: 'false',
        },
      };

      const newEvent = {
        ...event,
        PhysicalResourceId: 'newTableName',
        OldResourceProperties: {
          ...event.OldResourceProperties,
          tableName: {
            ...event.OldResourceProperties.tableName,
            generateSuffix: 'false',
          },
        },
      };

      await expect(manageTable(newResourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: 'newTableName',
      });
      expect(mockExecuteStatement).not.toHaveBeenCalledWith(expect.objectContaining({
        Sql: `ALTER TABLE ${tableNamePrefix}${stackIdTruncated} RENAME TO newTableName`,
      }));
    });

    test('does not replace if table name changes', async () => {
      const newResourceProperties = {
        ...resourceProperties,
        tableName: {
          ...resourceProperties.tableName,
          prefix: 'newTableName',
          generateSuffix: 'false',
        },
      };

      const newEvent = {
        ...event,
        OldResourceProperties: {
          ...event.OldResourceProperties,
          tableName: {
            ...event.OldResourceProperties.tableName,
            generateSuffix: 'false',
          },
        },
      };

      await expect(manageTable(newResourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `ALTER TABLE ${tableNamePrefix} RENAME TO newTableName`,
      }));
    });

    test('does not replace if table name added', async () => {
      const newResourceProperties = {
        ...resourceProperties,
        tableName: {
          prefix: 'newTable',
          generateSuffix: 'false',
        },
      };

      await expect(manageTable(newResourceProperties, event)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `ALTER TABLE ${tableNamePrefix}${stackIdTruncated} RENAME TO newTable`,
      }));
    });

    test('does not replace if table name removed', async () => {
      const newResourceProperties = {
        ...resourceProperties,
        tableName: {
          prefix: 'Table',
          generateSuffix: 'true',
        },
      };

      const newEvent = {
        ...event,
        OldResourceProperties: {
          ...event.OldResourceProperties,
          tableName: {
            ...event.OldResourceProperties.tableName,
            generateSuffix: 'false',
          },
        },
      };

      await expect(manageTable(newResourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `ALTER TABLE ${tableNamePrefix} RENAME TO Table${stackIdTruncated}`,
      }));
    });
  });

  test('does not replace if table columns removed', async () => {
    const newResourceProperties = {
      ...resourceProperties,
      tableColumns: [],
    };

    await expect(manageTable(newResourceProperties, event)).resolves.toMatchObject({
      PhysicalResourceId: physicalResourceId,
    });
    expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
      Sql: expect.stringMatching(new RegExp(`ALTER TABLE ${newResourceProperties.tableName.prefix}.+ DROP COLUMN col1`)),
    }));
  });

  test('does not replace if table columns added', async () => {
    const newTableColumnName = 'col2';
    const newTableColumnDataType = 'varchar(1)';
    const newTableColumns = [{ name: 'col1', dataType: 'varchar(1)' }, { name: newTableColumnName, dataType: newTableColumnDataType }];
    const newResourceProperties = {
      ...resourceProperties,
      tableColumns: newTableColumns,
    };

    await expect(manageTable(newResourceProperties, event)).resolves.toMatchObject({
      PhysicalResourceId: physicalResourceId,
    });
    expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
      Sql: `ALTER TABLE ${tableNamePrefix}${stackIdTruncated} ADD ${newTableColumnName} ${newTableColumnDataType}`,
    }));
  });

  describe('column name', () => {
    test('does not replace if column name changed', async () => {
      const newEvent = {
        ...event,
        OldResourceProperties: {
          ...event.OldResourceProperties,
          tableColumns: [
            { id: 'col1', name: 'col1', dataType: 'varchar(1)' },
          ],
        },
      };
      const newTableColumnName = 'col2';
      const newResourceProperties: ResourcePropertiesType = {
        ...resourceProperties,
        tableColumns: [
          { id: 'col1', name: newTableColumnName, dataType: 'varchar(1)' },
        ],
      };

      await expect(manageTable(newResourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `ALTER TABLE ${tableNamePrefix}${stackIdTruncated} RENAME COLUMN col1 TO ${newTableColumnName}`,
      }));
    });

    test('does not replace if column id assigned, from undefined', async () => {
      const newEvent = {
        ...event,
        OldResourceProperties: {
          ...event.OldResourceProperties,
          tableColumns: [
            { name: 'col1', dataType: 'varchar(1)' },
          ],
        },
      };
      const newResourceProperties: ResourcePropertiesType = {
        ...resourceProperties,
        tableColumns: [
          { id: 'col1', name: 'col1', dataType: 'varchar(1)' },
        ],
      };

      await expect(manageTable(newResourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).not.toHaveBeenCalledWith(expect.objectContaining({
        Sql: `ALTER TABLE ${tableNamePrefix}${stackIdTruncated} RENAME COLUMN col1 TO col1`,
      }));
    });
  });

  describe('distStyle and distKey', () => {
    test('replaces if distStyle is added', async () => {
      const newResourceProperties: ResourcePropertiesType = {
        ...resourceProperties,
        distStyle: TableDistStyle.EVEN,
      };

      await expect(manageTable(newResourceProperties, event)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `CREATE TABLE ${tableNamePrefix}${stackIdTruncated} (col1 varchar(1)) DISTSTYLE EVEN`,
      }));
    });

    test('replaces if distStyle is removed', async () => {
      const newEvent = {
        ...event,
        OldResourceProperties: {
          ...event.OldResourceProperties,
          distStyle: TableDistStyle.EVEN,
        },
      };
      const newResourceProperties = {
        ...resourceProperties,
      };

      await expect(manageTable(newResourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `CREATE TABLE ${tableNamePrefix}${stackIdTruncated} (col1 varchar(1))`,
      }));
    });

    test('does not replace if distStyle is changed', async () => {
      const newEvent: AWSLambda.CloudFormationCustomResourceEvent = {
        ...event,
        OldResourceProperties: {
          ...event.OldResourceProperties,
          distStyle: TableDistStyle.EVEN,
        },
      };
      const newDistStyle = TableDistStyle.ALL;
      const newResourceProperties: ResourcePropertiesType = {
        ...resourceProperties,
        distStyle: newDistStyle,
      };

      await expect(manageTable(newResourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `ALTER TABLE ${tableNamePrefix}${stackIdTruncated} ALTER DISTSTYLE ${newDistStyle}`,
      }));
    });

    test('adds key without creating table if distKey is added', async () => {
      const newResourceProperties: ResourcePropertiesType = {
        ...resourceProperties,
        tableColumns: [{ name: 'col1', dataType: 'varchar(1)', distKey: true }],
      };

      await expect(manageTable(newResourceProperties, event)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `ALTER TABLE ${tableNamePrefix}${stackIdTruncated} ALTER DISTSTYLE KEY DISTKEY col1`,
      }));
    });

    test('removes key without replacing table if distKey is removed', async () => {
      const newEvent: AWSLambda.CloudFormationCustomResourceEvent = {
        ...event,
        OldResourceProperties: {
          ...event.OldResourceProperties,
          tableColumns: [{ name: 'col1', dataType: 'varchar(1)', distKey: true }],
        },
      };
      const newResourceProperties: ResourcePropertiesType = {
        ...resourceProperties,
      };

      await expect(manageTable(newResourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `ALTER TABLE ${tableNamePrefix}${stackIdTruncated} ALTER DISTSTYLE AUTO`,
      }));
    });

    test('does not replace if distKey is changed', async () => {
      const newEvent: AWSLambda.CloudFormationCustomResourceEvent = {
        ...event,
        OldResourceProperties: {
          ...event.OldResourceProperties,
          tableColumns: [
            { name: 'col1', dataType: 'varchar(1)', distKey: true },
            { name: 'col2', dataType: 'varchar(1)' },
          ],
        },
      };
      const newDistKey = 'col2';
      const newResourceProperties: ResourcePropertiesType = {
        ...resourceProperties,
        tableColumns: [
          { name: 'col1', dataType: 'varchar(1)' },
          { name: 'col2', dataType: 'varchar(1)', distKey: true },
        ],
      };

      await expect(manageTable(newResourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `ALTER TABLE ${tableNamePrefix}${stackIdTruncated} ALTER DISTKEY ${newDistKey}`,
      }));
    });
  });

  describe('sortStyle and sortKeys', () => {
    const oldTableColumnsWithSortKeys: Column[] = [
      { name: 'col1', dataType: 'varchar(1)', sortKey: true },
      { name: 'col2', dataType: 'varchar(1)' },
    ];
    const newTableColumnsWithSortKeys: Column[] = [
      { name: 'col1', dataType: 'varchar(1)' },
      { name: 'col2', dataType: 'varchar(1)', sortKey: true },
    ];

    test('replaces when same sortStyle, different sortKey columns: INTERLEAVED', async () => {
      const newEvent: AWSLambda.CloudFormationCustomResourceEvent = {
        ...event,
        OldResourceProperties: {
          ...event.OldResourceProperties,
          tableColumns: oldTableColumnsWithSortKeys,
          sortStyle: TableSortStyle.INTERLEAVED,
        },
      };
      const newResourceProperties: ResourcePropertiesType = {
        ...resourceProperties,
        tableColumns: newTableColumnsWithSortKeys,
        sortStyle: TableSortStyle.INTERLEAVED,
      };

      await expect(manageTable(newResourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `CREATE TABLE ${tableNamePrefix}${stackIdTruncated} (col1 varchar(1),col2 varchar(1)) INTERLEAVED SORTKEY(col2)`,
      }));
    });

    test('replaces when different sortStyle: INTERLEAVED', async () => {
      const newEvent: AWSLambda.CloudFormationCustomResourceEvent = {
        ...event,
        OldResourceProperties: {
          ...event.OldResourceProperties,
          tableColumns: oldTableColumnsWithSortKeys,
          sortStyle: TableSortStyle.AUTO,
        },
      };
      const newResourceProperties: ResourcePropertiesType = {
        ...resourceProperties,
        tableColumns: oldTableColumnsWithSortKeys,
        sortStyle: TableSortStyle.INTERLEAVED,
      };

      await expect(manageTable(newResourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `CREATE TABLE ${tableNamePrefix}${stackIdTruncated} (col1 varchar(1),col2 varchar(1)) INTERLEAVED SORTKEY(col1)`,
      }));
    });

    test('does not replace when same sortStyle, different sortKey columns: COMPOUND', async () => {
      const newEvent: AWSLambda.CloudFormationCustomResourceEvent = {
        ...event,
        OldResourceProperties: {
          ...event.OldResourceProperties,
          tableColumns: oldTableColumnsWithSortKeys,
          sortStyle: TableSortStyle.COMPOUND,
        },
      };
      const newResourceProperties: ResourcePropertiesType = {
        ...resourceProperties,
        tableColumns: newTableColumnsWithSortKeys,
        sortStyle: TableSortStyle.COMPOUND,
      };

      await expect(manageTable(newResourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `ALTER TABLE ${tableNamePrefix}${stackIdTruncated} ALTER COMPOUND SORTKEY(col2)`,
      }));
    });

    test('does not replace when different sortStyle: COMPOUND', async () => {
      const newEvent: AWSLambda.CloudFormationCustomResourceEvent = {
        ...event,
        OldResourceProperties: {
          ...event.OldResourceProperties,
          tableColumns: oldTableColumnsWithSortKeys,
          sortStyle: TableSortStyle.AUTO,
        },
      };
      const newResourceProperties: ResourcePropertiesType = {
        ...resourceProperties,
        tableColumns: oldTableColumnsWithSortKeys,
        sortStyle: TableSortStyle.COMPOUND,
      };

      await expect(manageTable(newResourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `ALTER TABLE ${tableNamePrefix}${stackIdTruncated} ALTER COMPOUND SORTKEY(col1)`,
      }));
    });

    test('does not replace when different sortStyle: AUTO', async () => {
      const newEvent: AWSLambda.CloudFormationCustomResourceEvent = {
        ...event,
        OldResourceProperties: {
          ...event.OldResourceProperties,
          tableColumns: oldTableColumnsWithSortKeys,
          sortStyle: TableSortStyle.COMPOUND,
        },
      };
      const newResourceProperties: ResourcePropertiesType = {
        ...resourceProperties,
        tableColumns: oldTableColumnsWithSortKeys,
        sortStyle: TableSortStyle.AUTO,
      };

      await expect(manageTable(newResourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `ALTER TABLE ${tableNamePrefix}${stackIdTruncated} ALTER SORTKEY AUTO`,
      }));
    });
  });

  describe('table comment', () => {
    test('does not replace if comment added on table', async () => {
      const newComment = 'newComment';
      const newResourceProperties = {
        ...resourceProperties,
        tableComment: newComment,
      };

      await expect(manageTable(newResourceProperties, event)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `COMMENT ON TABLE ${tableNamePrefix}${stackIdTruncated} IS '${newComment}'`,
      }));
    });

    test('does not replace if comment removed on table', async () => {
      const newEvent = {
        ...event,
        OldResourceProperties: {
          ...event.OldResourceProperties,
          tableComment: 'oldComment',
        },
      };
      const newResourceProperties = {
        ...resourceProperties,
      };

      await expect(manageTable(newResourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `COMMENT ON TABLE ${tableNamePrefix}${stackIdTruncated} IS NULL`,
      }));
    });
  });

  describe('column comment', () => {
    test('does not replace if comment added on column', async () => {
      const newComment = 'newComment';
      const newResourceProperties = {
        ...resourceProperties,
        tableColumns: [{ name: 'col1', dataType: 'varchar(1)', comment: newComment }],
      };

      await expect(manageTable(newResourceProperties, event)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `COMMENT ON COLUMN ${tableNamePrefix}${stackIdTruncated}.col1 IS '${newComment}'`,
      }));
    });

    test('does not replace if comment removed on column', async () => {
      const newEvent = {
        ...event,
        OldResourceProperties: {
          ...event.OldResourceProperties,
          tableColumns: [{ name: 'col1', dataType: 'varchar(1)', comment: 'oldComment' }],
        },
      };

      await expect(manageTable(resourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `COMMENT ON COLUMN ${tableNamePrefix}${stackIdTruncated}.col1 IS NULL`,
      }));
    });
  });

  describe('column encoding', () => {
    test('does not replace if encoding added on column', async () => {
      const newResourceProperties = {
        ...resourceProperties,
        tableColumns: [{ name: 'col1', dataType: 'varchar(1)', encoding: ColumnEncoding.RAW }],
      };

      await expect(manageTable(newResourceProperties, event)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `ALTER TABLE ${tableNamePrefix}${stackIdTruncated} ALTER COLUMN col1 ENCODE RAW`,
      }));
    });

    test('does not replace if encoding removed on column', async () => {
      const newEvent = {
        ...event,
        OldResourceProperties: {
          ...event.OldResourceProperties,
          tableColumns: [{ name: 'col1', dataType: 'varchar(1)', encoding: ColumnEncoding.RAW }],
        },
      };
      const newResourceProperties = {
        ...resourceProperties,
      };

      await expect(manageTable(newResourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `ALTER TABLE ${tableNamePrefix}${stackIdTruncated} ALTER COLUMN col1 ENCODE AUTO`,
      }));
    });

    test('adds a comma between multiple statements', async () => {
      const newEvent = {
        ...event,
        OldResourceProperties: {
          ...event.OldResourceProperties,
          tableColumns: [{ name: 'col1', dataType: 'varchar(1)' }, { name: 'col2', dataType: 'varchar(1)' }],
        },
      };

      const newResourceProperties = {
        ...resourceProperties,
        tableColumns: [{ name: 'col1', dataType: 'varchar(1)', encoding: ColumnEncoding.RAW }, { name: 'col2', dataType: 'varchar(1)', encoding: ColumnEncoding.RAW }],
      };

      await expect(manageTable(newResourceProperties, newEvent)).resolves.toMatchObject({
        PhysicalResourceId: physicalResourceId,
      });
      expect(mockExecuteStatement).toHaveBeenCalledWith(expect.objectContaining({
        Sql: `ALTER TABLE ${tableNamePrefix}${stackIdTruncated} ALTER COLUMN col1 ENCODE RAW, ALTER COLUMN col2 ENCODE RAW`,
      }));
    });
  });
});
