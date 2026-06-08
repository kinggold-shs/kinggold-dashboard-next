/**
 * Focused regression checks for Size duplicate UI + validation.
 * Run: npx tsx scripts/variantModel-size-share-check.mjs
 */
import {
  getOptionSelectUiState,
  validateNonKaratOptionUniqueness,
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

console.log('\nRing Size duplicate 52 — UI state');
const ui = getOptionSelectUiState({
  typeName: 'Ring Size',
  catalogValues: ['50', '52', '54'],
  variants,
  mainVariant,
  optionTypes,
  shopifyOptions,
  excludeVariantId: null,
  currentValue: '',
});
assert(ui.selectableValues.length === 3, 'full catalog in selectableValues');
assert(!ui.hint, 'no exhaustion hint');
assert(!ui.disableSelect, 'select not disabled');

console.log('\nRing Size duplicate 52 — validation');
const sizeOnlyTypes = optionTypes.filter(t => t.name !== 'Color');
const validationErr = validateNonKaratOptionUniqueness(
  sizeOnlyTypes,
  { Karat: '18K', 'Ring Size': '52' },
  variants,
  mainVariant,
  { shopifyOptions },
);
assert(validationErr === null, 'no validation error for duplicate Size');

console.log('\nColor still enforces uniqueness');
const colorUi = getOptionSelectUiState({
  typeName: 'Color',
  catalogValues: ['Yellow', 'White'],
  variants,
  mainVariant,
  optionTypes,
  shopifyOptions,
  excludeVariantId: null,
  currentValue: '',
});
assert(colorUi.selectableValues.length < 2, 'Color filters used values');

const colorErr = validateNonKaratOptionUniqueness(
  optionTypes,
  { Karat: '18K', 'Ring Size': '50', Color: 'Yellow' },
  variants,
  mainVariant,
  { shopifyOptions },
);
assert(colorErr !== null, 'Color duplicate blocked');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
