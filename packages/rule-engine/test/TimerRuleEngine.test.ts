import { ProductEventPayload } from '@freshworks-jaya/marketplace-models';
import { Rule, RuleEngineExternalEventPayload } from '../src/index';
import 'mocha';
import { assert } from 'chai';
import sinon, { SinonSandbox } from 'sinon';
import { RuleProcessor } from '../src/RuleProcessor';
import { TimerRuleEngine } from '../src/TimerRuleEngine';
import Kairos from '@freshworks-jaya/kairos-api';
import ruleConfig from '../src/RuleConfig';
import recommendedPlugins from '../src/recommended/index';
import { ActionExecutor } from '../src/ActionExecutor';
import { AxiosPromise } from 'axios';
import { Integrations } from '../src/models/rule-engine';
import { RequestProxy } from '@freshworks-jaya/marketplace-models';
import { Utils } from '../src/Utils';
import { APITraceCodes } from '../src/models/error-codes';

describe('TimerRuleEngine test', () => {
  const productEventPayload = {
    data: {
      actor: {
        last_name: 'Doe',
        first_name: 'John',
        email: 'some-agent-email',
        type: 'agent',
        avatar: {
          url: 'some-avatar-url',
        },
        id: 'some-agent-id',
        phone: 'some-agent-phone',
      },
      message: {
        created_time: '2020-04-03T08:26:55.782Z',
        conversation_id: 'some-conv-id',
        response_due_type: 'NO_RESPONSE_DUE',
        user_id: 'some-user-id',
        channel_id: 'some-channel-id',
        reopened_time: '2020-04-05T16:58:52.806Z',
        app_id: 'some-app-id',
        status: 'new',
        messages: [
          {
            created_time: '2020-04-06T05:01:40.601Z',
            conversation_id: 'some-conv-id',
            id: 'some-message-id',
            user_id: 'some-user-id',
            message_source: 'web',
            message_type: 'normal',
            message_parts: [
              {
                text: {
                  content: 'hi',
                },
              },
            ],
            app_id: 'some-app-id',
          },
        ],
      },
      associations: {
        channel: {
          public: true,
          name: 'Inbox',
          welcome_message: {
            message_parts: [
              {
                text: {
                  content: 'Hello there!',
                },
              },
            ],
            message_type: 'normal',
            message_source: 'system',
          },
          updated_time: '2020-04-03T08:05:43.028Z',
          id: 'some-channel-id',
          tags: [],
          icon: {},
          locale: '',
          enabled: true,
        },
        user: {
          last_name: 'some-user-last-name',
          properties: [
            {
              name: 'fc_user_timezone',
              value: 'Asia/Calcutta',
            },
          ],
          first_name: 'some-user-first-name',
          created_time: '2020-04-03T08:26:55.409Z',
          avatar: {},
          id: 'some-user-id',
        },
      },
    },
    region: 'US',
    domain: 'web.freshchat.com',
    event: 'onMessageCreate',
    version: '1.0.0',
    account_id: 'some-marketplace-account-id',
    timestamp: 1586149300632,
  };

  const integrations = {
    freshchatv2: {
      url: 'https://api.freshchat.com/v2',
    },
    freshchatv1: {
      url: 'https://api.freshchat.com/app/services/app/v1',
    },
  };

  describe('invalidateTimers', () => {
    /**
     * SETUP
     * 1. Rule with invalidators.
     * 2. ProductEventPayload with event that causes
     * invalidation of rule defined above.
     * 3. Stub bulkDeleteSchedules to return success.
     * 4. Stub bulkDeleteSchedules to return failure.
     */
    let sandbox: SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      ruleConfig.registerPlugins(recommendedPlugins);
    });

    afterEach(() => {
      sandbox.restore();
      ruleConfig.reset();
    });

    const disabledRule = {
      name: 'When agent says hi in a particular channel',
      isEnabled: true,
    };

    const enabledNonTimerRule = {
      isTimer: false,
      name: 'When agent says hi in a particular channel',
      isEnabled: true,
    };

    const ruleWitoutInvalidators = {
      isTimer: true,
      name: 'When agent says hi in a particular channel',
      isEnabled: true,
      invalidators: null,
    };

    const ruleWithInvalidatorsNotMatching = {
      name: 'When agent says hi in a particular channel',
      isEnabled: true,
      isTimer: true,
      timerValue: 5,
      invalidators: [
        {
          actor: {
            type: 'USER',
          },
          action: {
            type: 'MESSAGE_CREATE',
          },
        },
      ],
    };

    const ruleWithInvalidatorsMatching = {
      name: 'When agent says hi in a particular channel',
      isEnabled: true,
      isTimer: true,
      timerValue: 5,
      invalidators: [
        {
          actor: {
            type: 'AGENT',
          },
          action: {
            type: 'MESSAGE_CREATE',
          },
        },
      ],
    };

    /**
     * Test 1: Disabled Rule
     * Test 2: Enabled NonTimer Rule
     * Test 3: Enabled Timer Rule without invalidators
     * Test 4: Rule with invalidators but not matching
     * Test 5: Rule with invalidators that are matching - Kairos Success
     * Test 6: Rule with invalidators that are matching - Kairos Failure
     */

    it('should not process disabled rule', () => {
      const spy = sandbox.spy(RuleProcessor.isTriggerConditionMatching);

      TimerRuleEngine.invalidateTimers(
        productEventPayload as any as ProductEventPayload,
        [disabledRule] as any as Rule[],
        '',
        {
          token: 'kairos token',
          url: 'kairos key',
          group: 'kairos group',
        },
        {
          freshchatv1: {
            token: 'tokenv1',
            url: 'urlv1',
          },
          freshchatv2: {
            token: 'tokenv2',
            url: 'urlv2',
          },
          googleCloudLoggingConfig: {
            project_id: 'projectid',
            private_key: 'privatekey',
            client_email: 'emailaddresshere',
            logName: 'jaya-lib',
          },
          marketplaceServices: {
            requestProxy: {} as unknown as RequestProxy,
          },
          featureFlags:{},
          timezoneOffset: -330,
        },
      );

      assert.isFalse(spy.called);
    });

    it('should not process enabled non timer rule', () => {
      const spy = sandbox.spy(RuleProcessor.isTriggerConditionMatching);

      TimerRuleEngine.invalidateTimers(
        productEventPayload as any as ProductEventPayload,
        [enabledNonTimerRule] as any as Rule[],
        '',
        {
          token: 'kairos token',
          url: 'kairos key',
          group: 'kairos group',
        },
        {
          freshchatv1: {
            token: 'tokenv1',
            url: 'urlv1',
          },
          freshchatv2: {
            token: 'tokenv2',
            url: 'urlv2',
          },
          googleCloudLoggingConfig: {
            project_id: 'projectid',
            private_key: 'privatekey',
            client_email: 'emailaddresshere',
            logName: 'jaya-lib',
          },
          marketplaceServices: {
            requestProxy: {} as unknown as RequestProxy,
          },
          featureFlags:{},
          timezoneOffset: -330,
        },
      );

      assert.isFalse(spy.called);
    });

    it('should not process enabled timer rule without invalidators', () => {
      const spy = sandbox.spy(RuleProcessor.isTriggerConditionMatching);

      TimerRuleEngine.invalidateTimers(
        productEventPayload as any as ProductEventPayload,
        [ruleWitoutInvalidators] as any as Rule[],
        '',
        {
          token: 'kairos token',
          url: 'kairos key',
          group: 'kairos group',
        },
        {
          freshchatv1: {
            token: 'tokenv1',
            url: 'urlv1',
          },
          freshchatv2: {
            token: 'tokenv2',
            url: 'urlv2',
          },
          googleCloudLoggingConfig: {
            project_id: 'projectid',
            private_key: 'privatekey',
            client_email: 'emailaddresshere',
            logName: 'jaya-lib',
          },
          marketplaceServices: {
            requestProxy: {} as unknown as RequestProxy,
          },
          featureFlags:{},
          timezoneOffset: -330,
        },
      );

      assert.isFalse(spy.called);
    });

    it('should not call bulkDeleteSchedules for enabled timer rule with no matching invalidators', () => {
      const spy = sandbox.spy(Kairos.prototype.bulkDeleteSchedules);

      TimerRuleEngine.invalidateTimers(
        productEventPayload as any as ProductEventPayload,
        [ruleWithInvalidatorsNotMatching] as any as Rule[],
        '',
        {
          token: 'kairos token',
          url: 'kairos key',
          group: 'kairos group',
        },
        {
          freshchatv1: {
            token: 'tokenv1',
            url: 'urlv1',
          },
          freshchatv2: {
            token: 'tokenv2',
            url: 'urlv2',
          },
          googleCloudLoggingConfig: {
            project_id: 'projectid',
            private_key: 'privatekey',
            client_email: 'emailaddresshere',
            logName: 'jaya-lib',
          },
          marketplaceServices: {
            requestProxy: {} as unknown as RequestProxy,
          },
          featureFlags:{},
          timezoneOffset: -330,
        },
      );

      assert.isFalse(spy.called);
    });

    it('should delete schedules when invalidators are matching', () => {
      const stub = sandbox.stub(Kairos.prototype, 'bulkDeleteSchedules');

      TimerRuleEngine.invalidateTimers(
        productEventPayload as any as ProductEventPayload,
        [ruleWithInvalidatorsMatching] as any as Rule[],
        '',
        {
          token: 'kairos token',
          url: 'kairos key',
          group: 'kairos group',
        },
        {
          freshchatv1: {
            token: 'tokenv1',
            url: 'urlv1',
          },
          freshchatv2: {
            token: 'tokenv2',
            url: 'urlv2',
          },
          googleCloudLoggingConfig: {
            project_id: 'projectid',
            private_key: 'privatekey',
            client_email: 'emailaddresshere',
            logName: 'jaya-lib',
          },
          marketplaceServices: {
            requestProxy: {} as unknown as RequestProxy,
          },
          featureFlags:{},
          timezoneOffset: -330,
        },
      );

      assert.isTrue(stub.called);
    });

    it('should delete schedules when invalidators are matching throws error', () => {
      sandbox.stub(Kairos.prototype, 'bulkDeleteSchedules').throws('error bulk deleting schedules');

      try {
        TimerRuleEngine.invalidateTimers(
          productEventPayload as any as ProductEventPayload,
          [ruleWithInvalidatorsMatching] as any as Rule[],
          '',
          {
            token: 'kairos token',
            url: 'kairos key',
            group: 'kairos group',
          },
          {
            freshchatv1: {
              token: 'tokenv1',
              url: 'urlv1',
            },
            freshchatv2: {
              token: 'tokenv2',
              url: 'urlv2',
            },
            googleCloudLoggingConfig: {
              project_id: 'projectid',
              private_key: 'privatekey',
              client_email: 'emailaddresshere',
              logName: 'jaya-lib',
            },
            marketplaceServices: {
              requestProxy: {} as unknown as RequestProxy,
            },
          featureFlags:{},
            timezoneOffset: -330,
          },
        );
      } catch (err) {
        assert('caught the exception thrown by invalidateTimers');
      }
    });
  });

  describe('executeTimerActions', () => {
    /**
     * SETUP
     * 1. Stub Kairos deleteSchedule success
     * 2. Stub Kairos deleteSchedule failure
     * 3. Stub ActionExecutor handleActions
     */

    let sandbox: SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      ruleConfig.registerPlugins(recommendedPlugins);
    });

    afterEach(() => {
      sandbox.restore();
      ruleConfig.reset();
    });

    const ruleWithActions = {
      blocks: [
        {
          conditions: [
            {
              operator: 'NOT_EQUALS',
              value: 'some-channel-id',
              key: 'CHANNEL',
            },
          ],
          matchType: 'ANY',
        },
      ],
      name: 'When agent says hi',
      isTimer: false,
      actions: [
        {
          type: 'SEND_MESSAGE',
          value: 'hello',
        },
      ],
      timerValue: 5,
      triggers: [
        {
          actor: {
            type: 'AGENT',
          },
          action: {
            type: 'MESSAGE_CREATE',
          },
        },
      ],
      matchType: 'ANY',
      invalidators: null,
      isEnabled: true,
    };

    const externalEventPayload = {
      data: {
        jobId: 'job-id',
        ruleIndex: 0,
        originalPayload: productEventPayload,
      },
    };

    const externalEventPaylodWrongRuleIndex = {
      data: {
        jobId: 'job-id',
        ruleIndex: 1,
        originalPayload: productEventPayload,
      },
    };

    it('throws error while deleting schedules', () => {
      sandbox.stub(Kairos.prototype, 'deleteSchedule').throws('error deleting schedule');

      try {
        TimerRuleEngine.executeTimerActions(
          externalEventPayload as any as RuleEngineExternalEventPayload,
          [ruleWithActions] as any as Rule[],
          {
            group: 'some group',
            token: 'some token',
            url: 'some url',
          },
          integrations as any as Integrations,
          [],
          {},
          {
            isSchedulerEnabled: false,
            isUseStaticIP: false,
            maxProductEventDelay: 30000,
          },
        );
      } catch (err) {
        assert('delete schedule threw an error');
      }
    });

    it('does not call handleActions', () => {
      sandbox.stub(Kairos.prototype, 'deleteSchedule');
      const spy = sandbox.spy(ActionExecutor.handleActions);

      TimerRuleEngine.executeTimerActions(
        externalEventPaylodWrongRuleIndex as any as RuleEngineExternalEventPayload,
        [ruleWithActions] as any as Rule[],
        {
          group: 'some group',
          token: 'some token',
          url: 'some url',
        },
        integrations as any as Integrations,
        [],
        {},
        {
          isSchedulerEnabled: false,
          isUseStaticIP: false,
          maxProductEventDelay: 30000,
        },
      );

      assert.isFalse(spy.called);
    });

    it('does calls handleActions', () => {
      sandbox.stub(Kairos.prototype, 'deleteSchedule');
      sandbox.stub(ActionExecutor.handleActions);

      TimerRuleEngine.executeTimerActions(
        externalEventPayload as any as RuleEngineExternalEventPayload,
        [ruleWithActions] as any as Rule[],
        {
          group: 'some group',
          token: 'some token',
          url: 'some url',
        },
        integrations as any as Integrations,
        [],
        {},
        {
          isSchedulerEnabled: false,
          isUseStaticIP: false,
          maxProductEventDelay: 30000,
        },
      );
    });
  });

  describe('triggerTimers', () => {
    let sandbox: SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      ruleConfig.registerPlugins(recommendedPlugins);
    });

    afterEach(() => {
      sandbox.restore();
      ruleConfig.reset();
    });

    const ruleWithActions = {
      blocks: [
        {
          conditions: [
            {
              operator: 'EQUALS',
              value: 'some-channel-id',
              key: 'CHANNEL',
            },
          ],
          matchType: 'ANY',
        },
      ],
      name: 'When agent says hi',
      isTimer: true,
      actions: [
        {
          type: 'SEND_MESSAGE',
          value: 'hello',
        },
      ],
      timerValue: 5,
      triggers: [
        {
          actor: {
            type: 'AGENT',
          },
          action: {
            type: 'MESSAGE_CREATE',
          },
        },
      ],
      matchType: 'ANY',
      invalidators: null,
      isEnabled: true,
    };

    const ruleNotMatchingConditions = {
      blocks: [
        {
          conditions: [
            {
              operator: 'NOT_EQUALS',
              value: 'some-channel-id',
              key: 'CHANNEL',
            },
          ],
          matchType: 'ANY',
        },
      ],
      name: 'When agent says hi',
      isTimer: true,
      actions: [
        {
          type: 'SEND_MESSAGE',
          value: 'hello',
        },
      ],
      timerValue: 5,
      triggers: [
        {
          actor: {
            type: 'AGENT',
          },
          action: {
            type: 'MESSAGE_CREATE',
          },
        },
      ],
      matchType: 'ANY',
      invalidators: null,
      isEnabled: true,
    };

    // it('creates a schedule for a matching timer rule', () => {
    //   sandbox.stub(Kairos.prototype, 'fetchSchedule').throws('schedule does not exist');

    //   const createStub = sandbox
    //     .stub(Kairos.prototype, 'bulkCreateSchedules')
    //     .returns((Promise.resolve('something') as any) as AxiosPromise<string>);

    //   TimerRuleEngine.triggerTimers(
    //     (productEventPayload as any) as ProductEventPayload,
    //     ([ruleWithActions] as any) as Rule[],
    //     'external event url',
    //     {
    //       group: 'some group',
    //       url: 'some url',
    //       token: 'some token',
    //     },
    //     (integrations as any) as Integrations,
    //   );

    //   assert.isTrue(createStub.called);
    // });

    it('rule not matching', () => {
      sandbox.stub(Kairos.prototype, 'fetchSchedule').throws('schedule does not exist');
      const createStub = sandbox
        .stub(Kairos.prototype, 'bulkCreateSchedules')
        .returns(Promise.resolve('something') as any as AxiosPromise<string>);

      TimerRuleEngine.triggerTimers(
        productEventPayload as any as ProductEventPayload,
        [ruleNotMatchingConditions] as any as Rule[],
        'external event url',
        {
          group: 'some group',
          url: 'some url',
          token: 'some token',
        },
        integrations as any as Integrations,
        {
          isSchedulerEnabled: false,
          isUseStaticIP: false,
          maxProductEventDelay: 30000,
        },
      );

      assert.isFalse(createStub.called);
    });

    it('bulk create throws error', () => {
      sandbox.stub(Kairos.prototype, 'fetchSchedule').throws('schedule does not exist');
      sandbox.stub(Kairos.prototype, 'bulkCreateSchedules').throws('error creating bulk schedules');

      try {
        TimerRuleEngine.triggerTimers(
          productEventPayload as any as ProductEventPayload,
          [ruleWithActions] as any as Rule[],
          'external event url',
          {
            group: 'some group',
            url: 'some url',
            token: 'some token',
          },
          integrations as any as Integrations,
          {
            isSchedulerEnabled: false,
            isUseStaticIP: false,
            maxProductEventDelay: 30000,
          },
        );
      } catch (err) {
        assert('bulk create throws error');
      }
    });

    it('schedule already exists', async () => {
      sandbox.stub(Kairos.prototype, 'fetchSchedule').resolves({
        data: {
          externalEventUrl: 'some external event url',
        },
        deleted: 1,
        group: 'some group',
        job_id: 'some job id',
        scheduled_time: 'some scheduled time',
        webhook: {
          url: 'some webhook url',
        },
      });
      const createStub = sandbox
        .stub(Kairos.prototype, 'bulkCreateSchedules')
        .returns(Promise.resolve('something') as any as AxiosPromise<string>);

      TimerRuleEngine.triggerTimers(
        productEventPayload as any as ProductEventPayload,
        [ruleNotMatchingConditions] as any as Rule[],
        'external event url',
        {
          group: 'some group',
          url: 'some url',
          token: 'some token',
        },
        integrations as any as Integrations,
        {
          isSchedulerEnabled: false,
          isUseStaticIP: false,
          maxProductEventDelay: 30000,
        },
      );

      assert.isFalse(createStub.called);
    });
  });

  describe('timer invalidation RCA logging', () => {
    let sandbox: SinonSandbox;

    const baseIntegrations = {
      freshchatv1: { token: 'tokenv1', url: 'urlv1' },
      freshchatv2: { token: 'tokenv2', url: 'urlv2' },
      googleCloudLoggingConfig: {
        project_id: 'projectid',
        private_key: 'privatekey',
        client_email: 'emailaddresshere',
        logName: 'jaya-lib',
      },
      marketplaceServices: {
        requestProxy: {} as unknown as RequestProxy,
      },
      featureFlags: {},
      timezoneOffset: -330,
    } as Integrations;

    const ruleWithInvalidatorsMatching = {
      name: 'Timer rule',
      isEnabled: true,
      isTimer: true,
      timerValue: 5,
      invalidators: [
        {
          actor: { type: 'AGENT' },
          action: { type: 'MESSAGE_CREATE' },
        },
      ],
    };

    const ruleWithInvalidatorsNotMatching = {
      name: 'Timer rule',
      isEnabled: true,
      isTimer: true,
      timerValue: 5,
      invalidators: [
        {
          actor: { type: 'USER' },
          action: { type: 'MESSAGE_CREATE' },
        },
      ],
    };

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      ruleConfig.registerPlugins(recommendedPlugins);
      sandbox.stub(Utils, 'log').resolves();
    });

    afterEach(() => {
      sandbox.restore();
      ruleConfig.reset();
    });

    it('logs INVALIDATE_NONE_MATCHED when invalidators do not match', async () => {
      sandbox.stub(Kairos.prototype, 'bulkDeleteSchedules').resolves();

      await TimerRuleEngine.invalidateTimers(
        productEventPayload as ProductEventPayload,
        [ruleWithInvalidatorsNotMatching] as Rule[],
        'external event url',
        { token: 't', url: 'u', group: 'g' },
        baseIntegrations,
      );

      const codes = (Utils.log as sinon.SinonStub).getCalls().map((call) => call.args[2]);
      assert.include(codes, APITraceCodes.INVALIDATE_TIMER_ATTEMPT);
      assert.include(codes, APITraceCodes.INVALIDATE_NONE_MATCHED);
    });

    it('logs INVALIDATE_RULE_MATCHED when invalidators match', async () => {
      sandbox.stub(Kairos.prototype, 'bulkDeleteSchedules').resolves();

      await TimerRuleEngine.invalidateTimers(
        productEventPayload as ProductEventPayload,
        [ruleWithInvalidatorsMatching] as Rule[],
        'external event url',
        { token: 't', url: 'u', group: 'g' },
        baseIntegrations,
      );

      const codes = (Utils.log as sinon.SinonStub).getCalls().map((call) => call.args[2]);
      assert.include(codes, APITraceCodes.INVALIDATE_RULE_MATCHED);
      assert.include(codes, APITraceCodes.INVALIDATE_SCHEDULE_SUCCESS);
    });

    it('logs CREATE_SCHEDULE_SKIPPED_EXISTING when Kairos job exists', async () => {
      sandbox.stub(Kairos.prototype, 'fetchSchedule').resolves({
        data: { externalEventUrl: 'url' },
        deleted: 0,
        group: 'g',
        job_id: 'job',
        scheduled_time: '2020-01-01T00:00:00.000Z',
        webhook: { url: 'url' },
      });
      const createStub = sandbox.stub(Kairos.prototype, 'bulkCreateSchedules').resolves();

      const matchingRule = {
        blocks: [
          {
            conditions: [{ operator: 'EQUALS', value: 'some-channel-id', key: 'CHANNEL' }],
            matchType: 'ANY',
          },
        ],
        name: 'When agent says hi',
        isTimer: true,
        actions: [{ type: 'SEND_MESSAGE', value: 'hello' }],
        timerValue: 5,
        triggers: [{ actor: { type: 'AGENT' }, action: { type: 'MESSAGE_CREATE' } }],
        matchType: 'ANY',
        invalidators: null,
        isEnabled: true,
      };

      await TimerRuleEngine.triggerTimers(
        {
          ...productEventPayload,
          data: {
            ...productEventPayload.data,
            actor: { ...productEventPayload.data.actor, type: 'agent' },
          },
          event: 'onMessageCreate',
        } as ProductEventPayload,
        [matchingRule] as Rule[],
        'external event url',
        { group: 'g', url: 'u', token: 't' },
        baseIntegrations,
        {
          enableLogger: true,
          isSchedulerEnabled: true,
          isUseStaticIP: false,
          maxProductEventDelay: 30000,
        },
      );

      const codes = (Utils.log as sinon.SinonStub).getCalls().map((call) => call.args[2]);
      assert.include(codes, APITraceCodes.CREATE_SCHEDULE_SKIPPED_EXISTING);
      assert.isFalse(createStub.called);
    });

    it('parses conversation_id from job id', () => {
      assert.equal(
        TimerRuleEngine.parseConversationIdFromJobId('896905834606006_1162979810778531_rule-A'),
        '1162979810778531',
      );
    });
  });
});
