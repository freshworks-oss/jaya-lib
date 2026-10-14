import { ProductEventData } from '@freshworks-jaya/marketplace-models';
import { Condition } from '../../models/rule';
import { Utils } from '../../Utils';
import { Integrations, RuleEngineOptions } from '../../models/rule-engine';

export default async (
  condition: Condition,
  productEventData: ProductEventData,
  integrations: Integrations,
  options: RuleEngineOptions,
  ruleAlias: string,
): Promise<void> => {
  const messageText = await Utils.resolveConditionMessageText(productEventData, integrations, ruleAlias);

  return Utils.evaluateCondition(
    condition.operator,
    messageText,
    condition.value as string,
    integrations,
    options,
    ruleAlias,
  );
};
