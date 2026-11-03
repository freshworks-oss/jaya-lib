import { ProductEventData } from '@freshworks-jaya/marketplace-models';
import { Condition, ConditionOperator } from '../../models/rule';
import { Utils } from '../../Utils';
import { Integrations, RuleEngineOptions } from '../../models/rule-engine';

/**
 * Operators satisfied by the ABSENCE of the configured value. Empty message text (e.g. a reopen event that
 * only carries the system "reopened" message) trivially satisfies them, so they must reject instead.
 */
const ABSENCE_OPERATORS: ConditionOperator[] = [ConditionOperator.DoesNotContain, ConditionOperator.ContainsNoneOf];

export default (
  condition: Condition,
  productEventData: ProductEventData,
  integrations: Integrations,
  options: RuleEngineOptions,
  ruleAlias: string,
): Promise<void> => {
  const messageText = Utils.getConditionMessageText(productEventData);

  if (!messageText && ABSENCE_OPERATORS.includes(condition.operator)) {
    return Promise.reject();
  }

  return Utils.evaluateCondition(
    condition.operator,
    messageText,
    condition.value as string,
    integrations,
    options,
    ruleAlias,
  );
};
