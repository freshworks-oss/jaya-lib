import { ProductEventData, User, UserProperty } from '@freshworks-jaya/marketplace-models';
import { Condition, PropertiesConditionValue, ConditionOperator } from '../../models/rule';
import { Utils } from '../../Utils';
import { Integrations, RuleEngineOptions } from '../../models/rule-engine';

/**
 * Freshchat sends built-in fields (e.g. locale) under `system_properties` with their own field
 * names, which don't always match the key a "User property" condition is configured with. Map
 * known condition-key -> system_properties-key mismatches here.
 */
const SYSTEM_PROPERTY_KEY_ALIASES: Record<string, string> = {
  locale: 'user_locale',
  total_sessions: 'sessions',
};

const findProperty = (
  properties: UserProperty[] | undefined,
  propertyKey: string,
): UserProperty | undefined =>
  properties &&
  properties.find((property) => property.name === propertyKey || property.oldName === propertyKey);

/**
 * Check if the given userProperty condition is satisfied by the userObj.
 * Looks in `properties` (admin-defined custom fields) first, then falls back to
 * `system_properties` (built-in fields like locale, country, etc.) - directly by the same key,
 * and also via a known alias (e.g. condition key "locale" -> system_properties key "user_locale") -
 * so conditions configured against either bucket resolve correctly.
 */
const evaluateUserPropertyCondition = (
  operator: ConditionOperator,
  userObj: User,
  conditionValue: PropertiesConditionValue,
  integrations: Integrations,
  options: RuleEngineOptions,
  ruleAlias: string,
): Promise<void> => {
  const propertyKey = conditionValue.propertyKey;
  const aliasedKey = SYSTEM_PROPERTY_KEY_ALIASES[propertyKey];

  const matchedProperty =
    findProperty(userObj.properties, propertyKey) ||
    findProperty(userObj.system_properties, propertyKey) ||
    (aliasedKey && findProperty(userObj.system_properties, aliasedKey));

  return Utils.evaluateCondition(
    operator,
    (matchedProperty && matchedProperty.value) || '',
    conditionValue.propertyValue,
    integrations,
    options,
    ruleAlias,
  );
};

export default (
  condition: Condition,
  productEventData: ProductEventData,
  integrations: Integrations,
  options: RuleEngineOptions,
  ruleAlias: string,
): Promise<void> => {
  return evaluateUserPropertyCondition(
    condition.operator,
    productEventData.associations.user,
    condition.value as PropertiesConditionValue,
    integrations,
    options,
    ruleAlias,
  );
};
