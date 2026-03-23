import { ProductEventPayload } from '@freshworks-jaya/marketplace-models';
import {
  RuleEngineOptions,
  Integrations,
  RuleEngineExternalEventPayload,
  KairosCredentials,
} from './models/rule-engine';

import { AnyJson, Api, CustomPlaceholdersMap, Rule } from './models/rule';
import { RulePlugin } from './models/plugin';
import { RuleProcessor } from './RuleProcessor';
import { ActionExecutor } from './ActionExecutor';
import { TimerRuleEngine } from './TimerRuleEngine';
import ruleConfig from './RuleConfig';
import recommendedPlugins from './recommended/index';
import { Utils } from './Utils';
import { APITraceCodes, ErrorCodes } from './models/error-codes';
import { LogSeverity } from './services/GoogleCloudLogging';

export * from './models/rule';
export * from './models/rule-engine';
export * from './models/plugin';
export * from './TimerRuleEngine';
export * from './services/GoogleCloudLogging';
export * from './services/GoogleServiceAccount';

export class RuleEngine {
  constructor(private plugins?: RulePlugin[]) {
    if (plugins) {
      ruleConfig.registerPlugins([...recommendedPlugins, ...plugins]);
    } else {
      ruleConfig.registerPlugins(recommendedPlugins);
    }
  }

  registerPlugins = ruleConfig.registerPlugins;

  executeActions = ActionExecutor.handleActions;

  async processProductEvent(
    payload: ProductEventPayload,
    rules: Rule[],
    apis: Api[],
    customPlaceholders: CustomPlaceholdersMap,
    options: RuleEngineOptions,
    externalEventUrl: string,
    integrations: Integrations,
    kairosCredentials?: KairosCredentials,
  ): Promise<void> {
    const eventStart = Date.now();
    console.log({ s: 'EventReceived', ts: eventStart });
    if (options.isSchedulerEnabled && kairosCredentials) {
      // Invalidate existing schedules and process all timer rules.
      console.log({ s: 'ScheduleInvalidationStart', ts: Date.now() });
      await TimerRuleEngine.invalidateTimers(payload, rules, externalEventUrl, kairosCredentials, integrations);
      console.log({ s: 'ScheduleCreationStart', ts: Date.now() });
      await TimerRuleEngine.triggerTimers(payload, rules, externalEventUrl, kairosCredentials, integrations, options);
    }

    // Process regular rules and get the actions of the first matching rule.
    try {
      console.log({ s: 'CheckFirstMatchingRuleStart', ts: Date.now() });
      const firstMatchingRule = await RuleProcessor.getFirstMatchingRule(payload.event, payload.data, rules, integrations, options);
      if (firstMatchingRule?.actions?.length) {
        const ruleAlias = firstMatchingRule.ruleAlias || '';
        await ActionExecutor.handleActions(integrations, firstMatchingRule.actions, payload, apis, customPlaceholders, options, ruleAlias);
      }
    } catch (err) {
      if (options.enableLogger) {
        Utils.log(payload, integrations, ErrorCodes.FreshchatAction, { error: err as AnyJson}, LogSeverity.ALERT);
      }
      throw err; // Rethrow the error to be handled by the caller.
    }
        console.log({ s: 'EventProcessingEnd', ts: Date.now(), d: Date.now() - eventStart });
  }

  async processExternalEvent(
    payload: RuleEngineExternalEventPayload,
    rules: Rule[],
    apis: Api[],
    customPlaceholders: CustomPlaceholdersMap,
    options: RuleEngineOptions,
    integrations: Integrations,
    kairosCredentials?: KairosCredentials,
  ): Promise<void> {
    if (options.isSchedulerEnabled && kairosCredentials) {
      try {
        await TimerRuleEngine.executeTimerActions(
          payload,
          rules,
          kairosCredentials,
          integrations,
          apis,
          customPlaceholders,
          options,
        );
      } catch (err) {
        Utils.log(
          payload as unknown as ProductEventPayload,
          integrations,
          APITraceCodes.EXECUTE_SCHEDULE_FAILURE,
          { error: err as AnyJson },
          LogSeverity.ALERT,
        );
        throw err;
      }
    }
  }
}
