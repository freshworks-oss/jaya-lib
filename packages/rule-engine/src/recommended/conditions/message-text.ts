import { ProductEventData } from '@freshworks-jaya/marketplace-models';
import { Condition, ConditionOperator } from '../../models/rule';
import { Utils } from '../../Utils';
import { Integrations, RuleEngineOptions } from '../../models/rule-engine';

/**
 * Operators that are satisfied by the ABSENCE of the configured value. An empty/unresolved message
 * text trivially satisfies these, which is exactly how reopen events used to incorrectly pass a
 * "does not contain" exclusion. When the message text cannot be resolved from a real user message,
 * these operators must fail-closed (reject) so the rule does not fire.
 */
const ABSENCE_OPERATORS: ConditionOperator[] = [ConditionOperator.DoesNotContain, ConditionOperator.ContainsNoneOf];

export default async (
  condition: Condition,
  productEventData: ProductEventData,
  integrations: Integrations,
  options: RuleEngineOptions,
  ruleAlias: string,
): Promise<void> => {
  const { text: messageText, resolved } = await Utils.resolveConditionMessageTextResult(
    productEventData,
    integrations,
    ruleAlias,
  );

  // Fail-closed: if we could not resolve the actual user message (e.g. a reopen/system event where
  // only the reopen status line is present, or the user-message fetch failed), do not let an
  // absence operator pass on an empty string.
  if (!resolved && ABSENCE_OPERATORS.includes(condition.operator)) {
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
