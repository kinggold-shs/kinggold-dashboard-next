/**
 * Regression checks for the per-level variant uniqueness rule.
 * Run: npx tsx scripts/variantModel-size-share-check.mjs
 *
 * Business rule (confirmed):
 *  - 1st type (Karat): repeats freely.
 *  - 2nd type (Size, etc.): repeats freely — deliberately, so multiple last-values hang off a karat+2nd pair.
 *  - Last type: must be UNIQUE PER PRODUCT — the real distinguisher of each item.
 *  - Only enforced when >= 2 customer option types.
 *
 * Legacy read-side helpers (stripShopifyOnlyOptionSuffix, normalizeOptionValuesForUi, etc.)
 * are still present for displaying existing data that used the old Code/suffix approach.
 */
import {
  customerOptionComboKey,
  filterCustomerOptionTypes,
  filterOptionsForUi,
  getOptionSelectUiState,
  getUsedOptionValues,
  filterSelectableOptionValues,
  hasDuplicateCustomerOptionCombo,
  hasDuplicatePrimaryOptionCombo,
  normalizeOptionValuesForUi,
  resolveOptionCatalogValues,
  stripShopifyOnlyOptionSuffix,
  SUB_VARIANT_DISCRIMINATOR_OPTION,
  SUB_VARIANT_VALUE_SUFFIX_SEP,
  unionVariantTypesWithLiveValues,
  validateLastOptionUniqueness,
  variantToOptionPayload,
  isSizeOption,
} from '../lib/variantModel.js';

const shopifyOptions = [
  { name: 'Karat', position: 1, values: ['18K', '21K'] },
  { name: 'Ring Size', position: 2, values: ['50', '52', '54'] },
  { name: 'Color', position: 3, values: ['Yellow', 'White'] },
];

const optionTypes = [
  { name: 'Karat', values: ['18K', '21K'] },
  { name: 'Ring Size', values: ['50', '52', '54'] },
  { name: 'Color', values: ['Yellow', 'White'] },
];

const mainVariant = { id: 1, option1: '18K', option2: '52', option3: 'Yellow', sku: 'MAIN001' };
const variants = [
  mainVariant,
  { id: 2, option1: '21K', option2: '52', option3: 'White', sku: 'SUB002' },
];

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  OK: ${label}`);
    passed += 1;
  } else {
    console.error(`  FAIL: ${label}`);
    failed += 1;
  }
}

// ---------------------------------------------------------------------------
// Size name detection
// ---------------------------------------------------------------------------
console.log('Ring Size name detection');
assert(isSizeOption('Ring Size'), 'isSizeOption("Ring Size")');
assert(isSizeOption('Sizes'), 'isSizeOption("Sizes") contains size');

console.log('\nPosition-2 fallback (Karat at slot 1)');
const positionFallbackOptions = [
  { name: 'Karat', position: 1, values: ['18K'] },
  { name: 'Diameter', position: 2, values: ['52'] },
];
assert(
  isSizeOption('Diameter', { shopifyOptions: positionFallbackOptions }),
  'isSizeOption at position 2 when Karat is option1',
);

// ---------------------------------------------------------------------------
// validateLastOptionUniqueness — the core new business rule
// ---------------------------------------------------------------------------
console.log('\nvalidateLastOptionUniqueness — last type must be unique per product');

// Last value ("Yellow") already exists on mainVariant → error
const dupLastErr = validateLastOptionUniqueness(
  optionTypes,
  { Karat: '18K', 'Ring Size': '54', Color: 'Yellow' },
  variants,
  mainVariant,
  { shopifyOptions },
);
assert(dupLastErr !== null, 'error when last value (Color) duplicates existing variant');
assert(
  dupLastErr?.includes('Color') && dupLastErr?.includes('Yellow'),
  'error message names the field and the value',
);

// Unique last value → null
const uniqueLastErr = validateLastOptionUniqueness(
  optionTypes,
  { Karat: '18K', 'Ring Size': '52', Color: 'Rose' },
  variants,
  mainVariant,
  { shopifyOptions },
);
assert(uniqueLastErr === null, 'no error when last value is unique across the product');

// Non-last value (Karat) may duplicate freely
const dupKaratErr = validateLastOptionUniqueness(
  optionTypes,
  { Karat: '18K', 'Ring Size': '50', Color: 'Rose' },
  variants,
  mainVariant,
  { shopifyOptions },
);
assert(dupKaratErr === null, 'no error when Karat (1st type) duplicates — allowed');

// Non-last value (2nd type) may duplicate freely within same karat
const dupSizeErr = validateLastOptionUniqueness(
  optionTypes,
  { Karat: '18K', 'Ring Size': '52', Color: 'Rose' },
  variants,
  mainVariant,
  { shopifyOptions },
);
assert(dupSizeErr === null, 'no error when 2nd type (Ring Size) duplicates — allowed');

// excludeVariantId: editing a variant should not flag itself
const editSelfErr = validateLastOptionUniqueness(
  optionTypes,
  { Karat: '18K', 'Ring Size': '52', Color: 'Yellow' },
  variants,
  mainVariant,
  { excludeVariantId: 1, shopifyOptions },   // mainVariant.id = 1 has Yellow
);
assert(editSelfErr === null, 'editing own variant: excluded from collision check');

// Single-type product → no uniqueness enforced
const singleTypeOpts = [{ name: 'Karat', values: ['18K', '21K'] }];
const singleTypeShopify = [{ name: 'Karat', position: 1, values: ['18K', '21K'] }];
const singleTypeVariants = [{ id: 10, option1: '18K', sku: 'M' }];
const singleTypeErr = validateLastOptionUniqueness(
  singleTypeOpts,
  { Karat: '18K' },
  singleTypeVariants,
  null,
  { shopifyOptions: singleTypeShopify },
);
assert(singleTypeErr === null, 'single-type product: rule not applied (< 2 customer types)');

// No value supplied for last type → no error (missing-field guard)
const noValueErr = validateLastOptionUniqueness(
  optionTypes,
  { Karat: '18K', 'Ring Size': '52' },   // Color missing
  variants,
  mainVariant,
  { shopifyOptions },
);
assert(noValueErr === null, 'no error when last type value is absent (not yet selected)');

// ---------------------------------------------------------------------------
// filterSelectableOptionValues + getUsedOptionValues — drives dropdown
// ---------------------------------------------------------------------------
console.log('\nDropdown filtering for last type');
const twoOptShopify = [
  { name: 'Karat', position: 1, values: ['18K'] },
  { name: 'Size', position: 2, values: ['1', '2', '3'] },
];
const twoOptTypes = [
  { name: 'Karat', values: ['18K'] },
  { name: 'Size', values: ['1', '2', '3'] },
];
const twoOptMain = { id: 10, option1: '18K', option2: '1', sku: 'MAIN' };
const twoOptSubs = [
  twoOptMain,
  { id: 11, option1: '18K', option2: '2', sku: 'SUB11' },
];
const usedSizes = getUsedOptionValues(twoOptSubs, null, 'Size', twoOptTypes, null, twoOptShopify);
assert(usedSizes.includes('1') && usedSizes.includes('2'), 'getUsedOptionValues returns used last values');
const selectable = filterSelectableOptionValues(['1', '2', '3'], usedSizes, '');
assert(!selectable.includes('1') && !selectable.includes('2'), 'used last values removed from selectable');
assert(selectable.includes('3'), 'unused last value still selectable');

// excludeVariantId: editing variant's own current value stays selectable
const selectableEdit = filterSelectableOptionValues(
  ['1', '2', '3'],
  getUsedOptionValues(twoOptSubs, null, 'Size', twoOptTypes, 11, twoOptShopify),  // exclude sub11 (Size=2)
  '2',   // currentValue being edited
);
assert(selectableEdit.includes('2'), 'editing own variant: its current value remains selectable');

// ---------------------------------------------------------------------------
// Duplicate combo detection (helpers remain valid)
// ---------------------------------------------------------------------------
console.log('\nTwo-option product — duplicate combo detection (unchanged helpers)');
const main18k1 = { id: 10, option1: '18K', option2: '1', sku: 'MAIN001' };
const subs18k1 = [main18k1];

assert(
  hasDuplicateCustomerOptionCombo(
    { Karat: '18K', Size: '1' },
    subs18k1,
    twoOptShopify,
    twoOptTypes,
  ),
  'detects duplicate full combo on existing variant',
);
assert(
  hasDuplicatePrimaryOptionCombo(
    { Karat: '18K', Size: '1' },
    subs18k1,
    twoOptShopify,
    twoOptTypes,
  ),
  'legacy hasDuplicatePrimaryOptionCombo delegates',
);
assert(
  !hasDuplicateCustomerOptionCombo(
    { Karat: '18K', Size: '2' },
    subs18k1,
    twoOptShopify,
    twoOptTypes,
  ),
  'no duplicate when Size differs',
);

// ---------------------------------------------------------------------------
// Legacy read-side helpers — display of existing Code/suffix data
// ---------------------------------------------------------------------------
console.log('\nLegacy suffix round-trip (read-side, backward compat)');
const suffixed = `5gm${SUB_VARIANT_VALUE_SUFFIX_SEP}SUB789`;
assert(
  stripShopifyOnlyOptionSuffix(suffixed, 'SUB789') === '5gm',
  'stripShopifyOnlyOptionSuffix strips SKU suffix',
);
assert(
  stripShopifyOnlyOptionSuffix(suffixed) === '5gm',
  'stripShopifyOnlyOptionSuffix strips without SKU hint',
);

console.log('\nvariantToOptionPayload strips legacy suffix for UI');
const legacySuffixedVariant = {
  id: 30,
  sku: 'SUB789',
  option1: '18K',
  option2: '52',
  option3: `5gm${SUB_VARIANT_VALUE_SUFFIX_SEP}SUB789`,
};
const threeOptionShopify = [
  { name: 'Karat', position: 1, values: ['18K'] },
  { name: 'Size', position: 2, values: ['52'] },
  { name: 'gm', position: 3, values: [`5gm${SUB_VARIANT_VALUE_SUFFIX_SEP}SUB789`] },
];
const threeOptionTypes = [
  { name: 'Karat', values: ['18K'] },
  { name: 'Size', values: ['52'] },
  { name: 'gm', values: ['5gm'] },
];
const stripped = variantToOptionPayload(legacySuffixedVariant, threeOptionTypes, threeOptionShopify);
assert(stripped.gm === '5gm', 'variantToOptionPayload strips ·SKU suffix from option3');

console.log('\nfilterOptionsForUi strips Shopify-only suffix from catalog');
const suffixedCatalog = filterOptionsForUi([
  { name: 'gm', values: [`3.070${SUB_VARIANT_VALUE_SUFFIX_SEP}86000021`, '5gm'] },
]);
assert(
  suffixedCatalog[0].values.includes('3.070') && !suffixedCatalog[0].values.some(v => v.includes(SUB_VARIANT_VALUE_SUFFIX_SEP)),
  'filterOptionsForUi shows display values only',
);

console.log('\nunionVariantTypesWithLiveValues strips suffix when merging');
const mergedTypes = unionVariantTypesWithLiveValues(
  [{ name: 'gm', values: [`3.070${SUB_VARIANT_VALUE_SUFFIX_SEP}86000021`] }],
  [{ id: 40, sku: '86000021', option1: '18K', option2: '52', option3: `3.070${SUB_VARIANT_VALUE_SUFFIX_SEP}86000021` }],
  [{ name: 'Karat', position: 1 }, { name: 'Size', position: 2 }, { name: 'gm', position: 3 }],
);
assert(
  mergedTypes[0].values.length === 1 && mergedTypes[0].values[0] === '3.070',
  'unionVariantTypesWithLiveValues dedupes to display value',
);

console.log('\nresolveOptionCatalogValues strips Shopify option catalog');
const catalog = resolveOptionCatalogValues(
  { name: 'gm', values: [] },
  [{ name: 'gm', values: [`3.070${SUB_VARIANT_VALUE_SUFFIX_SEP}86000021`] }],
  [],
  null,
);
assert(
  catalog.length === 1 && catalog[0] === '3.070',
  'resolveOptionCatalogValues from shop options',
);

console.log('\nUI catalog — strip suffix and dedupe gm values');
const suffixedGm = `3.070${SUB_VARIANT_VALUE_SUFFIX_SEP}86000021`;
assert(
  normalizeOptionValuesForUi(['3.070', suffixedGm]).join() === '3.070',
  'dedupe base when suffixed duplicate exists',
);
const filtered = filterOptionsForUi([
  { name: 'gm', values: ['3.070', suffixedGm, '5.000'] },
]);
assert(
  filtered[0].values.join() === '3.070,5.000',
  'filterOptionsForUi shows clean catalog only',
);

console.log('\nOption select — displayValue strips current selection');
const gmUi = getOptionSelectUiState({
  typeName: 'gm',
  catalogValues: ['3.070', '5.000'],
  currentValue: suffixedGm,
  variantSku: '86000021',
});
assert(gmUi.displayValue === '3.070', 'displayValue is stripped base');
assert(
  gmUi.selectableValues.join() === '3.070,5.000',
  'selectableValues are stripped catalog',
);

console.log('\nCode hidden from customer option types (legacy data filter)');
const withCode = [
  { name: 'Karat', values: ['18K'] },
  { name: 'Size', values: ['1'] },
  { name: SUB_VARIANT_DISCRIMINATOR_OPTION, values: ['SUB456'] },
];
assert(
  filterCustomerOptionTypes(withCode).length === 2,
  'Code filtered from customer-facing types',
);

// ---------------------------------------------------------------------------
// Global duplicate UI state (Ring Size shows full catalog — 2nd type, not last when 3 types)
// ---------------------------------------------------------------------------
console.log('\nGlobal duplicates — Ring Size UI state (middle type, all values selectable)');
const ui = getOptionSelectUiState({
  typeName: 'Ring Size',
  catalogValues: ['50', '52', '54'],
});
assert(ui.selectableValues.length === 3, 'full catalog in selectableValues');
assert(!ui.hint, 'no exhaustion hint');
assert(!ui.disableSelect, 'select not disabled');

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
