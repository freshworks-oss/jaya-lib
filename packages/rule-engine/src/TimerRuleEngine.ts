import Kairos, { KairosSchedule, KairosScheduleOptions } from '@freshworks-jaya/kairos-api';
import { Event, ProductEventPayload, ProductEventData, ModelProperties } from '@freshworks-jaya/marketplace-models';
import { ActionExecutor } from './ActionExecutor';
import {
  AnyJson,
  Api,
  CustomPlaceholdersMap,
  Rule
} from './models/rule';
import { RuleProcessor } from './RuleProcessor';
import {
  KairosCredentials,
  RuleEngineExternalEventPayload,
  Integrations,
  RuleEngineOptions,
} from './models/rule-engine';
import { Utils } from './Utils';
import { ErrorCodes, ErrorTypes, APITraceCodes } from './models/error-codes';
import { LogSeverity } from './services/GoogleCloudLogging';
import { assignmentConditions } from './models/constants';
export class TimerRuleEngine {
  /**
   * Add minutes to date object.
   */
  public static addSeconds(date: Date, seconds: number): Date {
    return new Date(date.getTime() + seconds * 1000);
  }

  /**
   * Checks if the rule is a timer rule and is enabled.
   */
  public static isMatchingTimerRule(
    event: Event,
    productEventData: ProductEventData,
    rule: Rule,
    integrations: Integrations,
    options: RuleEngineOptions,
  ): Promise<void> {
    if (rule.isTimer && rule.isEnabled) {
      return RuleProcessor.isRuleMatching(event, productEventData, rule, integrations, options);
    } else {
      return Promise.reject();
    }
  }

  /**
   * Gets the model for either conversation or message.
   */
  public static getModelProperties(productEventData: ProductEventData): ModelProperties {
    return productEventData.conversation || productEventData.message;
  }

  /**
   * Trigger creation of timers for incoming event.
   */
  public static async triggerTimers(
    payload: ProductEventPayload,
    rules: Rule[],
    externalEventUrl: string,
    kairosCredentials: KairosCredentials,
    integrations: Integrations,
    options: RuleEngineOptions,
  ): Promise<void> {
    console.log({ s: 'ScheduleCheckStart', ts: Date.now() });
    let schedulesToCreate: KairosScheduleOptions[] = [];
    const scheduler = new Kairos(kairosCredentials);

    // Iterate through each rule
    for (let ruleIndex = 0, len = rules.length; ruleIndex < len; ruleIndex += 1) {
      const rule = rules[ruleIndex];

      const modelProperties = this.getModelProperties(payload.data);
      let isMatchingTimerRule = false;
      // Check for timer rules that are enabled and are matching the trigger conditions.
      try {
        await this.isMatchingTimerRule(payload.event, payload.data, rule, integrations, options);
        isMatchingTimerRule = true;
      } catch (err) {}
      if (isMatchingTimerRule) {
        const ruleIdentifier = rule.ruleAlias ? rule.ruleAlias : ruleIndex;
        const jobId = `${modelProperties.app_id}_${modelProperties.conversation_id}_${ruleIdentifier}`;

        // Fetch an existing schedule for the same current rule,
        let existingSchedule;
        try {
          existingSchedule = (await scheduler.fetchSchedule(jobId)) as KairosSchedule;
        } catch (err) {
          console.log({ s: 'ScheduleCheckError', ts: Date.now() });
        }
        // If there are no existing schedules, create schedule object
        // and push it into the schedules array for bulk scheduling later.

        if (!existingSchedule) {
          const scheduledTime = this.addSeconds(new Date(), rule.timerValue).toISOString();

          const originalPayload = {
            app_id: modelProperties.app_id,
            data: {
              actor: payload.data.actor,
              associations: payload.data.associations,
              conversation: payload.data.conversation,
              message: payload.data.message,
            },
            domain: payload.domain,
            event: payload.event,
            region: payload.region,
            timestamp: payload.timestamp,
            version: payload.timestamp,
          };

          // encoded data is sent to make sure that translatetions are not corrupted by Kairos API
          const encodedPayload = Buffer.from(JSON.stringify(originalPayload)).toString('base64');

          schedulesToCreate = [
            ...schedulesToCreate,
            {
              jobId,
              payload: {
                jobId,
                originalPayload: encodedPayload,
                ruleAlias: rule.ruleAlias,
                ruleIndex,
                scheduled_at: scheduledTime,
              },
              scheduledTime,
              webhookUrl: externalEventUrl,
            },
          ];
        }
      }
    }
    if (schedulesToCreate.length) {
      try {
        await scheduler.bulkCreateSchedules(schedulesToCreate);

        // logging successful creation of rule schedule
        await Utils.log(
          payload,
          integrations,
          APITraceCodes.CREATE_SCHEDULE_SUCCESS,
          {
            jobIds: schedulesToCreate.map((schedule) => schedule?.jobId),
          },
          LogSeverity.NOTICE,
        );
      } catch (err) {
        Utils.log(
          payload,
          integrations,
          ErrorCodes.KairosError,
          {
            error: err as AnyJson,
            errorType: ErrorTypes.KairosBulkCreateSchedules,
            jobIds: schedulesToCreate.map((schedule) => schedule.jobId),
          },
          LogSeverity.CRITICAL,
        );

        return Promise.reject('Error creating bulk schedules');
      }
    }
    return Promise.resolve();
  }

  /**
   * Execute actions on completion of timer.
   */
  public static async executeTimerActions(
    externalEventPayload: RuleEngineExternalEventPayload,
    rules: Rule[],
    kairosCredentials: KairosCredentials,
    integrations: Integrations,
    apis: Api[],
    customPlaceholders: CustomPlaceholdersMap,
    options: RuleEngineOptions,
  ): Promise<void> {
    const scheduler = new Kairos(kairosCredentials);

    // Delete schedule for given jobId
    try {
      await scheduler.deleteSchedule(externalEventPayload.data.jobId);

      Utils.log(
        externalEventPayload as unknown as ProductEventPayload,
        integrations,
        APITraceCodes.EXECUTE_SCHEDULE_SUCCESS,
        {
          jobId: externalEventPayload.data?.jobId,
        },
        LogSeverity.DEBUG,
      );
    } catch (err) {
      Utils.log(
        externalEventPayload as unknown as ProductEventPayload,
        integrations,
        ErrorCodes.KairosError,
        {
          error: err as AnyJson,
          errorType: ErrorTypes.KairosDeleteCompletedSchedule,
          jobId: externalEventPayload.data?.jobId,
        },
        LogSeverity.CRITICAL,
      );
      throw new Error('Error deleting kairos schedule before execution');
    }

    let timerRule: Rule | undefined;
    // Get rule that needs to be executed
    if (externalEventPayload.data.ruleAlias) {
      timerRule = rules.find((rule) => rule.ruleAlias === externalEventPayload.data.ruleAlias);
    } else {
      timerRule = rules[externalEventPayload.data.ruleIndex];
    }


    let originalPayload = {} as ProductEventPayload;

    // Decode and parse the originalPayload. Handle the case where the originalPayload is object,
    // but app update has happened before schedule execution.
    const encodedData = typeof externalEventPayload.data.originalPayload === 'string'
      ? externalEventPayload.data.originalPayload
      : externalEventPayload.data.originalPayload?.encodedData;

    if (encodedData) {
      const data = Buffer.from(encodedData, 'base64').toString();
      originalPayload = JSON.parse(data) as ProductEventPayload;
    }


    // Execute actions
    if (timerRule && Array.isArray(timerRule.actions)) {
      return ActionExecutor.handleActions(
        integrations,
        timerRule.actions,
        originalPayload,
        apis,
        customPlaceholders,
        options,
      );
    }
  }

  /**
   * Invalidate rules with timers that match the trigger conditions.
   */
  public static async invalidateTimers(
    payload: ProductEventPayload,
    rules: Rule[],
    externalEventUrl: string,
    kairosCredentials: KairosCredentials,
    integrations: Integrations,
  ): Promise<void> {
    const modelProperties = payload.data.conversation || payload.data.message;

    const jobsToDelete = rules.reduce((jobIds: string[], rule, ruleIndex) => {
      let isMatch = false;

      if (rule.isEnabled && rule.isTimer && rule.invalidators) {
        isMatch = RuleProcessor.isTriggerConditionMatching(payload.event, payload.data, rule.invalidators);
      }

      if (isMatch) {
        const ruleIdentifier = rule.ruleAlias ? rule.ruleAlias : ruleIndex;
        jobIds.push(`${modelProperties.app_id}_${modelProperties.conversation_id}_${ruleIdentifier}`);
      }
      return jobIds;
    }, []);

    if (jobsToDelete && jobsToDelete.length) {
      const scheduler = new Kairos(kairosCredentials);
      if (
        RuleProcessor.isTriggerConditionMatching(payload.event, payload.data, assignmentConditions)
      ) {
        // Current event is IntelliAssign assigns an Agent, or assignment rule assigns an Agent or group schedule to cancel it after 3 seconds
        const createScheduleJobId = `${modelProperties.app_id}_${modelProperties.conversation_id}_delay_invalidation`;
        const scheduledTime = this.addSeconds(new Date(), 3).toISOString();
        return scheduler
          .createSchedule({
            jobId: createScheduleJobId,
            payload: {
              eventData: {
                jobsToDelete,
              },
              eventType: 'DELETE_SCHEDULES',
              scheduled_at: scheduledTime,
            },
            scheduledTime,
            webhookUrl: externalEventUrl,
          })
          .then(
            async () => {
              await Utils.log(
                payload,
                integrations,
                APITraceCodes.DELAY_SCHEDULE_CREATION,
                {
                  createScheduleJobId,
                  jobId: jobsToDelete,
                },
                LogSeverity.NOTICE,
              );
              return Promise.resolve();
            },
            (err: AnyJson) => {
              Utils.log(
                payload,
                integrations,
                ErrorCodes.KairosError,
                {
                  error: err as AnyJson,
                  errorType: ErrorTypes.KairosCreteScheduleToDelayInvalidation,
                  jobId: createScheduleJobId,
                },
                LogSeverity.CRITICAL,
              );

              return Promise.reject('Error during createSchedule');
            },
          );
      } else {
        // Bulk delete the jobs
        return scheduler.bulkDeleteSchedules(jobsToDelete).then(
          async () => {
            await Utils.log(
              payload,
              integrations,
              APITraceCodes.INVALIDATE_SCHEDULE_SUCCESS,
              {
                jobId: jobsToDelete,
              },
              LogSeverity.NOTICE,
            );
            return Promise.resolve();
          },
          (err: AnyJson) => {
            Utils.log(
              payload,
              integrations,
              ErrorCodes.KairosError,
              {
                error: err as AnyJson,
                errorType: ErrorTypes.KairosDeleteInvalidatedSchedules,
                jobIds: jobsToDelete,
              },
              LogSeverity.CRITICAL,
            );
            return Promise.reject('Error during bulkDeleteSchedules');
          },
        );
      }
    }
    return Promise.resolve();
  }
}
