/**
 * Regression checks for global duplicate selection + Shopify discriminator strategies.
 * Run: npx tsx scripts/variantModel-size-share-check.mjs
 */
import {
  applyShopifyOnlyOptionSuffix,
  customerOptionComboKey,
  filterCustomerOptionTypes,
  getOptionSelectUiState,
  hasDuplicateCustomerOptionCombo,
  hasDuplicatePrimaryOptionCombo,
  resolveSubVariantOptionSelections,
  stripShopifyOnlyOptionSuffix,
  SUB_VARIANT_DISCRIMINATOR_OPTION,
  SUB_VARIANT_VALUE_SUFFIX_SEP,
  validateNonKaratOptionUniqueness,
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

const mainVariant = { id: 1, option1: '18K', option2: '52', option3: 'Yellow' };
const variants = [
  { id: 2, option1: '21K', option2: '52', option3: 'White' },
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

console.log('\nGlobal duplicates — Ring Size UI state');
const ui = getOptionSelectUiState({
  typeName: 'Ring Size',
  catalogValues: ['50', '52', '54'],
});
assert(ui.selectableValues.length === 3, 'full catalog in selectableValues');
assert(!ui.hint, 'no exhaustion hint');
assert(!ui.disableSelect, 'select not disabled');

console.log('\nGlobal duplicates — Color UI state');
const colorUi = getOptionSelectUiState({
  typeName: 'Color',
  catalogValues: ['Yellow', 'White'],
});
assert(colorUi.selectableValues.length === 2, 'Color shows full catalog');
assert(!colorUi.hint, 'no Color exhaustion hint');

console.log('\nGlobal duplicates — validation no-op');
const validationErr = validateNonKaratOptionUniqueness(
  optionTypes,
  { Karat: '18K', 'Ring Size': '52', Color: 'Yellow' },
  variants,
  mainVariant,
  { shopifyOptions },
);
assert(validationErr === null, 'no validation error for any duplicate');

console.log('\nTwo-option product — duplicate combo detection');
const twoOptionShopify = [
  { name: 'Karat', position: 1, values: ['18K'] },
  { name: 'Size', position: 2, values: ['1', '2'] },
];
const twoOptionTypes = [
  { name: 'Karat', values: ['18K'] },
  { name: 'Size', values: ['1', '2'] },
];
const main18k1 = { id: 10, option1: '18K', option2: '1', sku: 'MAIN001' };
const subs18k1 = [main18k1];

assert(
  hasDuplicateCustomerOptionCombo(
    { Karat: '18K', Size: '1' },
    subs18k1,
    twoOptionShopify,
    twoOptionTypes,
  ),
  'detects duplicate full combo on existing variant',
);
assert(
  hasDuplicatePrimaryOptionCombo(
    { Karat: '18K', Size: '1' },
    subs18k1,
    twoOptionShopify,
    twoOptionTypes,
  ),
  'legacy hasDuplicatePrimaryOptionCombo delegates',
);
assert(
  !hasDuplicateCustomerOptionCombo(
    { Karat: '18K', Size: '2' },
    subs18k1,
    twoOptionShopify,
    twoOptionTypes,
  ),
  'no duplicate when Size differs',
);

console.log('\nTwo-option duplicate — auto Code discriminator');
const resolved = resolveSubVariantOptionSelections({
  selectedByName: { Karat: '18K', Size: '1' },
  sku: 'SUB456',
  variants: subs18k1,
  shopifyOptions: twoOptionShopify,
  optionTypes: twoOptionTypes,
});
assert(resolved.discriminatorApplied, 'discriminator applied for duplicate combo');
assert(!resolved.suffixApplied, 'no suffix when <3 customer types');
assert(
  resolved.selectedByName[SUB_VARIANT_DISCRIMINATOR_OPTION] === 'SUB456',
  'Code set to FN6 SKU',
);
assert(!resolved.error, 'no error when SKU provided');

const missingSku = resolveSubVariantOptionSelections({
  selectedByName: { Karat: '18K', Size: '1' },
  sku: '',
  variants: subs18k1,
  shopifyOptions: twoOptionShopify,
  optionTypes: twoOptionTypes,
});
assert(missingSku.error !== null, 'error when duplicate combo and no SKU');

console.log('\nThree-option product — suffix discriminator (not Code)');
const threeOptionShopify = [
  { name: 'Karat', position: 1, values: ['18K'] },
  { name: 'Size', position: 2, values: ['52'] },
  { name: 'gm', position: 3, values: ['5gm'] },
];
const threeOptionTypes = [
  { name: 'Karat', values: ['18K'] },
  { name: 'Size', values: ['52'] },
  { name: 'gm', values: ['5gm'] },
];
const main3 = { id: 20, option1: '18K', option2: '52', option3: '5gm', sku: 'MAIN020' };
const subs3 = [main3];

assert(
  hasDuplicateCustomerOptionCombo(
    { Karat: '18K', Size: '52', gm: '5gm' },
    subs3,
    threeOptionShopify,
    threeOptionTypes,
  ),
  'detects duplicate Karat+Size+gm combo',
);

const suffixResolved = resolveSubVariantOptionSelections({
  selectedByName: { Karat: '18K', Size: '52', gm: '5gm' },
  sku: 'SUB789',
  variants: subs3,
  shopifyOptions: threeOptionShopify,
  optionTypes: threeOptionTypes,
});
assert(!suffixResolved.discriminatorApplied, 'no Code when 3 customer types');
assert(suffixResolved.suffixApplied, 'suffix applied on last option');
assert(
  suffixResolved.selectedByName.gm === `5gm${SUB_VARIANT_VALUE_SUFFIX_SEP}SUB789`,
  'gm suffixed with SKU for Shopify',
);
assert(
  !suffixResolved.selectedByName[SUB_VARIANT_DISCRIMINATOR_OPTION],
  'Code not set when 3 customer types',
);

console.log('\nSuffix round-trip');
const suffixed = applyShopifyOnlyOptionSuffix('5gm', 'SUB789');
assert(
  suffixed === `5gm${SUB_VARIANT_VALUE_SUFFIX_SEP}SUB789`,
  'applyShopifyOnlyOptionSuffix',
);
assert(
  stripShopifyOnlyOptionSuffix(suffixed, 'SUB789') === '5gm',
  'stripShopifyOnlyOptionSuffix',
);

console.log('\nCustomer combo key');
assert(
  customerOptionComboKey(
    { Karat: '18K', Size: '52', gm: '5gm' },
    threeOptionTypes,
    threeOptionShopify,
  ).includes('5gm'),
  'combo key includes all customer dimensions',
);

console.log('\nvariantToOptionPayload strips suffix for UI');
const suffixedVariant = {
  id: 30,
  sku: 'SUB789',
  option1: '18K',
  option2: '52',
  option3: `5gm${SUB_VARIANT_VALUE_SUFFIX_SEP}SUB789`,
};
const stripped = variantToOptionPayload(suffixedVariant, threeOptionTypes, threeOptionShopify);
assert(stripped.gm === '5gm', 'suffix stripped from option3 when reading variant');

console.log('\nCode hidden from customer option types');
const withCode = [
  { name: 'Karat', values: ['18K'] },
  { name: 'Size', values: ['1'] },
  { name: SUB_VARIANT_DISCRIMINATOR_OPTION, values: ['SUB456'] },
];
assert(
  filterCustomerOptionTypes(withCode).length === 2,
  'Code filtered from customer-facing types',
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
