/**
 * The RuleProcessor class is responsible for evaluating rules against incoming product events
 * and determining if the conditions and triggers within those rules match the event data.
 * It supports complex rule configurations including conditions, blocks, triggers, and actions.
 *
 * Methods:
 * - isConditionMatching: Evaluates if a single condition within a rule matches the product event data.
 * - isBlockMatching: Evaluates if a block of conditions matches the product event data based on the block's match type.
 * - isTriggerActorMatch: Determines if the actor of a trigger matches the actor in the product event data.
 * - isTriggerActionMatch: Determines if the action of a trigger matches the action in the product event data.
 * - isTriggerConditionMatching: Evaluates if any trigger within a set of triggers matches the product event data.
 * - isRuleBlocksMatching: Evaluates if the blocks within a rule match the product event data based on the rule's match type.
 * - isRuleMatching: Determines if a rule matches the product event data by evaluating both its triggers and blocks.
 * - isEnabledNonTimerRule: Checks if a rule is enabled and is not a timer-based rule.
 * - getFirstMatchingRule: Iterates through a list of rules and returns the first rule that matches the product event data.
 *
 * Each method that evaluates conditions, blocks, or rules returns a promise that resolves if the evaluation is successful
 * and rejects if the evaluation fails. This allows for asynchronous processing of conditions and blocks that may require
 * external API calls or other asynchronous operations.
 *
 * The class relies on a configuration object (ruleConfig) that defines the logic for evaluating conditions, triggers,
 * and actions. This configuration must be provided externally and is expected to match the structure of the rules being evaluated.
 */
import { Event, ProductEventData } from '@freshworks-jaya/marketplace-models';
import { Block, Condition, MatchType, Rule, Trigger, TriggerAction, TriggerActor } from './models/rule';
import { Integrations, RuleEngineOptions } from './models/rule-engine';
import { Promise } from 'bluebird';
import ruleConfig from './RuleConfig';

export class RuleProcessor {
  /**
   * `isConditionMatching`: Asynchronously evaluates if a specific condition within a rule matches the given product event data.
   * Utilizes a condition function defined in `ruleConfig` based on the condition's key. Throws an error if the condition key is invalid.
   *
   * @param productEventData - The data associated with the product event being evaluated.
   * @param condition - The condition object to evaluate.
   * @param integrations - External integrations that may be required for condition evaluation.
   * @param options - Additional options for the rule engine.
   * @param rule - The rule object that contains the condition.
   * @returns A promise that resolves if the condition matches, otherwise throws an error.
   */
  public static async isConditionMatching(
    productEventData: ProductEventData,
    condition: Condition,
    integrations: Integrations,
    options: RuleEngineOptions,
    rule: Rule,
  ): Promise<void> {
    const conditionFunc = ruleConfig.conditions?.[condition.key];
    if (!conditionFunc) throw new Error('Invalid condition key');

    const ruleAlias = rule.ruleAlias || '';
    return conditionFunc(condition, productEventData, integrations, options, ruleAlias);
  }

  /**
   * `isBlockMatching`: Asynchronously evaluates if a block of conditions within a rule matches the given product event data.
   * Evaluates all conditions within the block based on the block's match type (`All` or `Any`). Throws an error if the match type is invalid or if any condition does not match (for `All` match type).
   *
   * @param productEventData - The data associated with the product event being evaluated.
   * @param block - The block object containing conditions to evaluate.
   * @param integrations - External integrations that may be required for condition evaluation.
   * @param options - Additional options for the rule engine.
   * @param rule - The rule object that contains the block.
   * @returns A promise that resolves if the block matches, otherwise throws an error.
   */
  public static async isBlockMatching(
    productEventData: ProductEventData,
    block: Block,
    integrations: Integrations,
    options: RuleEngineOptions,
    rule: Rule,
  ): Promise<void> {
    if (!block?.conditions?.length) return;

    try {
      const conditionChecks = block.conditions.map((condition) =>
        this.isConditionMatching(productEventData, condition, integrations, options, rule),
      );

      if (block.matchType === MatchType.All) {
        await Promise.all(conditionChecks);
      } else if (block.matchType === MatchType.Any) {
        await Promise.any(conditionChecks);
      } else {
        throw new Error('Invalid conditions matchType');
      }
    } catch {
      throw new Error('Some conditions did not match');
    }
  }

  /**
   * `isTriggerActorMatch`: Synchronously checks if the actor of a trigger matches the actor specified in the product event data.
   * Utilizes a trigger actor function defined in `ruleConfig` based on the actor's type. Throws an error if the trigger actor type is invalid.
   *
   * @param actor - The trigger actor object to match against the product event data.
   * @param productEventData - The data associated with the product event being evaluated.
   * @returns A boolean indicating whether the trigger actor matches the product event data.
   */
  public static isTriggerActorMatch(actor: TriggerActor, productEventData: ProductEventData): boolean {
    const triggerActorFunc = ruleConfig.triggerActors?.[actor.type];
    if (!triggerActorFunc) throw new Error('Invalid trigger actor');

    return triggerActorFunc(productEventData, actor);
  }

  /**
   * `isTriggerActionMatch`: Synchronously checks if the action of a trigger matches the action specified in the product event data.
   * Utilizes a trigger action function defined in `ruleConfig` based on the action's type. Throws an error if the trigger action type is invalid.
   *
   * @param action - The trigger action object to match against the product event data.
   * @param event - The event object associated with the product event.
   * @param productEventData - The data associated with the product event being evaluated.
   * @returns A boolean indicating whether the trigger action matches the product event data.
   */
  public static isTriggerActionMatch(action: TriggerAction, event: Event, productEventData: ProductEventData): boolean {
    const triggerActionFunc = ruleConfig.triggerActions?.[action.type];
    if (!triggerActionFunc) throw new Error('Invalid trigger action : ' + action.type);

    return triggerActionFunc(event, productEventData, action);
  }

  /**
   * `isTriggerConditionMatching`: Synchronously evaluates if any trigger within a set of triggers matches the product event data.
   * A match occurs if both the trigger's actor and action match the product event data. Returns false if no triggers are provided.
   *
   * @param event - The event object associated with the product event.
   * @param productEventData - The data associated with the product event being evaluated.
   * @param triggers - An array of trigger objects to evaluate.
   * @returns A boolean indicating whether any trigger matches the product event data.
   */
  public static isTriggerConditionMatching(
    event: Event,
    productEventData: ProductEventData,
    triggers: Trigger[],
  ): boolean {
    return (
      triggers?.some(
        (trigger) =>
          this.isTriggerActorMatch(trigger.actor, productEventData) &&
          this.isTriggerActionMatch(trigger.action, event, productEventData),
      ) ?? false
    );
  }

  /**
   * `isRuleBlocksMatching`: Asynchronously evaluates if the blocks within a rule match the given product event data.
   * Evaluates all blocks within the rule based on the rule's match type (`All` or `Any`). Throws an error if the match type is invalid or if any block does not match (for `All` match type).
   *
   * @param productEventData - The data associated with the product event being evaluated.
   * @param rule - The rule object containing blocks to evaluate.
   * @param integrations - External integrations that may be required for block evaluation.
   * @param options - Additional options for the rule engine.
   * @returns A promise that resolves if the blocks match, otherwise throws an error.
   */
  public static async isRuleBlocksMatching(
    productEventData: ProductEventData,
    rule: Rule,
    integrations: Integrations,
    options: RuleEngineOptions,
  ): Promise<void> {
    if (!rule.blocks?.length) return;

    const blockChecks = rule.blocks.map((block) =>
      this.isBlockMatching(productEventData, block, integrations, options, rule),
    );

    try {
      if (rule.matchType === MatchType.All) {
        await Promise.all(blockChecks);
      } else if (rule.matchType === MatchType.Any) {
        await Promise.any(blockChecks);
      } else {
        throw new Error('Invalid blocks matchType');
      }
    } catch {
      throw new Error('Some blocks did not match');
    }
  }

  /**
   * `isRuleMatching`: Asynchronously determines if a rule matches the given product event data.
   * A rule matches if its triggers match the product event data and its blocks match the product event data. Throws an error if no trigger condition matches.
   *
   * @param event - The event object associated with the product event.
   * @param productEventData - The data associated with the product event being evaluated.
   * @param rule - The rule object to evaluate.
   * @param integrations - External integrations that may be required for rule evaluation.
   * @param options - Additional options for the rule engine.
   * @returns A promise that resolves if the rule matches, otherwise throws an error.
   */
  public static async isRuleMatching(
    event: Event,
    productEventData: ProductEventData,
    rule: Rule,
    integrations: Integrations,
    options: RuleEngineOptions,
  ): Promise<void> {
    if (!this.isTriggerConditionMatching(event, productEventData, rule.triggers)) {
      throw new Error('noTriggerConditionMatch');
    }

    await this.isRuleBlocksMatching(productEventData, rule, integrations, options);
  }

  /**
   * `isEnabledNonTimerRule`: Synchronously checks if a rule is enabled and is not a timer-based rule.
   *
   * @param rule - The rule object to check.
   * @returns A boolean indicating whether the rule is enabled and not timer-based.
   */
  public static isEnabledNonTimerRule(rule: Rule): boolean {
    return !rule.isTimer && rule.isEnabled;
  }

  /**
   * `getFirstMatchingRule`: Asynchronously iterates through a list of rules and returns the first rule that matches the given product event data.
   * Skips rules that are not enabled or are timer-based. Throws an error if no matching rule is found.
   *
   * @param event - The event object associated with the product event.
   * @param productEventData - The data associated with the product event being evaluated.
   * @param rules - An array of rule objects to evaluate.
   * @param integrations - External integrations that may be required for rule evaluation.
   * @param options - Additional options for the rule engine.
   * @returns A promise that resolves with the first matching rule, otherwise throws an error.
   */
  public static async getFirstMatchingRule(
    event: Event,
    productEventData: ProductEventData,
    rules: Rule[],
    integrations: Integrations,
    options: RuleEngineOptions,
  ): Promise<Rule | null> {
    for (const rule of rules) {
      if (this.isEnabledNonTimerRule(rule)) {
        try {
          await this.isRuleMatching(event, productEventData, rule, integrations, options);
          return rule;
        } catch (err) {}
      }
    }
    return null;
  }
}
