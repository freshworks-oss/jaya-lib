import { assert } from 'chai';
import 'mocha';
import { ProductEventData } from '@freshworks-jaya/marketplace-models';
import ruleConfig from '../src/RuleConfig';
import recommendedPlugins from '../src/recommended/index';
import conditionUserProperty from '../src/recommended/conditions/user-property';
import { Condition, ConditionKey, ConditionOperator } from '../src/models/rule';
import { Integrations, RuleEngineOptions } from '../src/models/rule-engine';

interface TestProperty {
  name: string;
  oldName?: string;
  value: string;
}

const integrations = {} as Integrations;
const options = {} as RuleEngineOptions;

const buildEventData = (user: {
  properties?: TestProperty[];
  system_properties?: TestProperty[];
}): ProductEventData => ({ associations: { user } } as unknown as ProductEventData);

const buildCondition = (propertyKey: string, propertyValue: string, operator = ConditionOperator.Equals): Condition => ({
  key: ConditionKey.UserProperty,
  operator,
  value: { propertyKey, propertyValue },
});

const matches = async (condition: Condition, data: ProductEventData): Promise<boolean> => {
  try {
    await conditionUserProperty(condition, data, integrations, options, 'rule-alias');
    return true;
  } catch (err) {
    return false;
  }
};

describe('USER_PROPERTY condition', () => {
  beforeEach(() => {
    ruleConfig.registerPlugins(recommendedPlugins);
  });

  afterEach(() => {
    ruleConfig.reset();
  });

  describe('custom properties (existing behaviour)', () => {
    it('matches a value in user.properties', async () => {
      const data = buildEventData({ properties: [{ name: 'plan', value: 'gold' }] });
      assert.isTrue(await matches(buildCondition('plan', 'gold'), data));
    });

    it('does not match a different value in user.properties', async () => {
      const data = buildEventData({ properties: [{ name: 'plan', value: 'gold' }] });
      assert.isFalse(await matches(buildCondition('plan', 'silver'), data));
    });

    it('matches on oldName for migrated accounts', async () => {
      const data = buildEventData({ properties: [{ name: 'plan_v2', oldName: 'plan', value: 'gold' }] });
      assert.isTrue(await matches(buildCondition('plan', 'gold'), data));
    });

    it('does not match when the property is missing', async () => {
      const data = buildEventData({ properties: [], system_properties: [] });
      assert.isFalse(await matches(buildCondition('plan', 'gold'), data));
    });

    it('does not throw when the user has no property lists', async () => {
      const data = buildEventData({});
      assert.isFalse(await matches(buildCondition('locale', 'en'), data));
    });
  });

  describe('system_properties fallback', () => {
    it('matches a built-in field by its own key', async () => {
      const data = buildEventData({ system_properties: [{ name: 'country', value: 'India' }] });
      assert.isTrue(await matches(buildCondition('country', 'India'), data));
    });

    it('prefers user.properties over system_properties for the same key', async () => {
      const data = buildEventData({
        properties: [{ name: 'country', value: 'India' }],
        system_properties: [{ name: 'country', value: 'US' }],
      });
      assert.isTrue(await matches(buildCondition('country', 'India'), data));
      assert.isFalse(await matches(buildCondition('country', 'US'), data));
    });
  });

  describe('key aliases', () => {
    it('resolves the "locale" condition key from system_properties "user_locale"', async () => {
      const data = buildEventData({ system_properties: [{ name: 'user_locale', value: 'fr' }] });
      assert.isTrue(await matches(buildCondition('locale', 'fr'), data));
    });

    it('does not match the wrong locale through the alias', async () => {
      const data = buildEventData({ system_properties: [{ name: 'user_locale', value: 'en' }] });
      assert.isFalse(await matches(buildCondition('locale', 'fr'), data));
    });

    it('still matches a "locale" entry directly when present', async () => {
      const data = buildEventData({ system_properties: [{ name: 'locale', value: 'fr' }] });
      assert.isTrue(await matches(buildCondition('locale', 'fr'), data));
    });

    it('matches the "user_locale" key directly', async () => {
      const data = buildEventData({ system_properties: [{ name: 'user_locale', value: 'fr' }] });
      assert.isTrue(await matches(buildCondition('user_locale', 'fr'), data));
    });

    it('resolves "total_sessions" from system_properties "sessions"', async () => {
      const data = buildEventData({ system_properties: [{ name: 'sessions', value: '3' }] });
      assert.isTrue(await matches(buildCondition('total_sessions', '3'), data));
    });
  });

  describe('operators', () => {
    const data = buildEventData({ system_properties: [{ name: 'user_locale', value: 'fr-FR' }] });

    it('supports contains (case-insensitive)', async () => {
      assert.isTrue(await matches(buildCondition('locale', 'FR', ConditionOperator.Contains), data));
    });

    it('supports starts with', async () => {
      assert.isTrue(await matches(buildCondition('locale', 'fr', ConditionOperator.StartsWith), data));
    });

    it('supports not equals', async () => {
      assert.isTrue(await matches(buildCondition('locale', 'en', ConditionOperator.NotEquals), data));
      assert.isFalse(await matches(buildCondition('locale', 'fr-FR', ConditionOperator.NotEquals), data));
    });

    it('supports set / not set', async () => {
      assert.isTrue(await matches(buildCondition('locale', '', ConditionOperator.Set), data));
      assert.isTrue(await matches(buildCondition('missing_key', '', ConditionOperator.NotSet), data));
    });
  });
});
