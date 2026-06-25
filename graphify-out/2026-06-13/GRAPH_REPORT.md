# Graph Report - kinggold-dashboard-next  (2026-06-13)

## Corpus Check
- 111 files · ~45,776 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 774 nodes · 1816 edges · 62 communities (33 shown, 29 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 77 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `252437c9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_UI Primitives|UI Primitives]]
- [[_COMMUNITY_Impeccable Skill|Impeccable Skill]]
- [[_COMMUNITY_FN6 Item Fields|FN6 Item Fields]]
- [[_COMMUNITY_API Routes Axios|API Routes Axios]]
- [[_COMMUNITY_Variant Model|Variant Model]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_CSP Detection|CSP Detection]]
- [[_COMMUNITY_FN6 Spec Builder|FN6 Spec Builder]]
- [[_COMMUNITY_Generated File Detection|Generated File Detection]]
- [[_COMMUNITY_Design Reference Docs|Design Reference Docs]]
- [[_COMMUNITY_App Layout Shell|App Layout Shell]]
- [[_COMMUNITY_Shared UI Utils|Shared UI Utils]]
- [[_COMMUNITY_Design Parser|Design Parser]]
- [[_COMMUNITY_FN6 Product Modals|FN6 Product Modals]]
- [[_COMMUNITY_Variant API Routes|Variant API Routes]]
- [[_COMMUNITY_Shopify Variant Types|Shopify Variant Types]]
- [[_COMMUNITY_UI Components|UI Components]]
- [[_COMMUNITY_UI Form Controls|UI Form Controls]]
- [[_COMMUNITY_Components Config|Components Config]]
- [[_COMMUNITY_Shopify API Routes|Shopify API Routes]]
- [[_COMMUNITY_Variant Cleanup|Variant Cleanup]]
- [[_COMMUNITY_FN6 Constants|FN6 Constants]]
- [[_COMMUNITY_JS Config|JS Config]]
- [[_COMMUNITY_Impeccable Onboard|Impeccable Onboard]]
- [[_COMMUNITY_Vercel Config|Vercel Config]]
- [[_COMMUNITY_Impeccable Optimize|Impeccable Optimize]]
- [[_COMMUNITY_Impeccable Overdrive|Impeccable Overdrive]]
- [[_COMMUNITY_Misc 50|Misc 50]]
- [[_COMMUNITY_Misc 51|Misc 51]]
- [[_COMMUNITY_Misc 52|Misc 52]]
- [[_COMMUNITY_Misc 53|Misc 53]]
- [[_COMMUNITY_Misc 54|Misc 54]]
- [[_COMMUNITY_Misc 55|Misc 55]]
- [[_COMMUNITY_Misc 56|Misc 56]]
- [[_COMMUNITY_Misc 57|Misc 57]]
- [[_COMMUNITY_Misc 60|Misc 60]]
- [[_COMMUNITY_Misc 61|Misc 61]]
- [[_COMMUNITY_Misc 62|Misc 62]]
- [[_COMMUNITY_Misc 63|Misc 63]]
- [[_COMMUNITY_Misc 64|Misc 64]]
- [[_COMMUNITY_Misc 65|Misc 65]]
- [[_COMMUNITY_Misc 66|Misc 66]]
- [[_COMMUNITY_Misc 67|Misc 67]]
- [[_COMMUNITY_Misc 68|Misc 68]]
- [[_COMMUNITY_Misc 69|Misc 69]]
- [[_COMMUNITY_Misc 70|Misc 70]]
- [[_COMMUNITY_Misc 71|Misc 71]]
- [[_COMMUNITY_Misc 72|Misc 72]]
- [[_COMMUNITY_Misc 73|Misc 73]]
- [[_COMMUNITY_Misc 74|Misc 74]]
- [[_COMMUNITY_Misc 75|Misc 75]]
- [[_COMMUNITY_Misc 77|Misc 77]]
- [[_COMMUNITY_Misc 78|Misc 78]]
- [[_COMMUNITY_Misc 79|Misc 79]]
- [[_COMMUNITY_Misc 80|Misc 80]]
- [[_COMMUNITY_Misc 82|Misc 82]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 50 edges
2. `getShopifyToken()` - 44 edges
3. `fetchProductVariants()` - 24 edges
4. `parseApiJson()` - 23 edges
5. `productOptionTypes()` - 21 edges
6. `Impeccable Skill` - 21 edges
7. `filterCustomerOptionTypes()` - 20 edges
8. `Button()` - 19 edges
9. `reconcileProductVariantTypes()` - 18 edges
10. `variantToOptionPayload()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Layers Icon Motif` --semantically_similar_to--> `LoginPage()`  [INFERRED] [semantically similar]
  public/favicon.svg → app/login/page.jsx
- `Layers Icon Motif` --semantically_similar_to--> `LoadingScreen()`  [INFERRED] [semantically similar]
  public/favicon.svg → components/AuthGate.jsx
- `metadata` --rationale_for--> `Browser Tab Icon`  [INFERRED]
  app/layout.jsx → public/favicon.svg
- `Gold Stroke Color (#ca8a04)` --conceptually_related_to--> `metadata`  [INFERRED]
  public/favicon.svg → app/layout.jsx
- `RootLayout()` --calls--> `cn()`  [INFERRED]
  app/layout.jsx → lib/utils.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Craft Visual Direction and Asset Production Flow** — reference_craft, reference_codex, reference_codex_step_f, agents_impeccable_asset_producer [EXTRACTED 1.00]
- **Impeccable Evaluate Commands Scoring System** — reference_critique, reference_audit, reference_heuristics_scoring, reference_cognitive_load [INFERRED 0.85]
- **Impeccable Color System** — impeccable_skill_color_strategy, reference_color_and_contrast_oklch, reference_color_and_contrast_tinted_neutrals, reference_colorize, reference_color_and_contrast_wcag [INFERRED 0.85]
- **Eight Interactive States Pattern** — reference_interaction_design_eight_interactive_states, reference_polish_interaction_states_checklist, reference_product_product_register [INFERRED 0.85]
- **Semantic Z-Index Scale** — reference_interaction_design_semantic_z_index_scale, reference_spatial_design_semantic_z_index_scale, reference_layout_spacing_system [INFERRED 0.85]
- **Impeccable Live Mode Workflow** — reference_live_poll_loop, reference_live_identity_lock, reference_live_parameters_contract, reference_live_carbonize_cleanup [EXTRACTED 1.00]
- **KingGold Layers Brand Mark** — public_favicon, public_favicon_layers_icon, components_dashboardshell, components_authgate_loadingscreen, login_page_loginpage [INFERRED 0.85]

## Communities (62 total, 29 thin omitted)

### Community 0 - "UI Primitives"
Cohesion: 0.13
Nodes (41): enrichChains(), GET(), loadProductContext(), POST(), PUT(), advanceChain(), buildChainKey(), createOrUpdateVariantForCode() (+33 more)

### Community 1 - "Impeccable Skill"
Cohesion: 0.06
Nodes (52): Impeccable Asset Producer, No Redesign Core Rule, direct Asset Bucket, produce Asset Bucket, semantic Asset Bucket, Impeccable Skill, Absolute Design Bans, AI Slop Test (+44 more)

### Community 2 - "FN6 Item Fields"
Cohesion: 0.12
Nodes (20): CodeChainsEditor(), ShopifyVariantsEditor(), variantDeleteLabel(), VariantsPanel(), VariantTypesEditor(), Badge, Dialog(), DialogContent() (+12 more)

### Community 3 - "API Routes Axios"
Cohesion: 0.10
Nodes (31): api, BASE_URL, GET(), jsonNoStore(), NO_STORE_HEADERS, GET(), jsonNoStore(), NO_STORE_HEADERS (+23 more)

### Community 4 - "Variant Model"
Cohesion: 0.07
Nodes (28): customerOptionComboKey(), hasDuplicateCustomerOptionCombo(), hasDuplicatePrimaryOptionCombo(), catalog, filtered, gmUi, legacySuffixedVariant, main18k1 (+20 more)

### Community 5 - "Package Dependencies"
Cohesion: 0.04
Nodes (46): dependencies, axios, @base-ui/react, class-variance-authority, clsx, cmdk, date-fns, @hookform/resolvers (+38 more)

### Community 6 - "CSP Detection"
Cohesion: 0.12
Nodes (29): allVariantsForOptionScan(), collectOptionValuesFromVariants(), DEFAULT_KARAT_PRESET, defaultVariantTypesForNewProduct(), displayVariantTitle(), filterOptionsForUi(), filterSelectableOptionValues(), getOptionSelectUiState() (+21 more)

### Community 7 - "FN6 Spec Builder"
Cohesion: 0.09
Nodes (39): bodyHtmlToSpec(), buildDefaultDescription(), buildDefaultSpec(), formatCurrency(), isSpecLine(), mergeToBodyHtml(), SPEC_LINE_PREFIXES, specToBodyHtml() (+31 more)

### Community 8 - "Generated File Detection"
Cohesion: 0.36
Nodes (7): API_BASE, getItemImageDisplayUrls(), getItemImageUrls(), proxiedMediaUrl(), resolveMediaUrl(), mapMediaFromItem(), MediaSection()

### Community 9 - "Design Reference Docs"
Cohesion: 0.07
Nodes (19): Semantic Z-Index Scale, Live-Mode Density Parameter, Carbonize Cleanup, Default vs Departure Mode, Identity Lock, Live Parameters Contract, Live Poll Loop, prefers-reduced-motion (+11 more)

### Community 10 - "App Layout Shell"
Cohesion: 0.07
Nodes (32): inter, metadata, RootLayout(), Providers(), AuthGate(), LoadingScreen(), PUBLIC, DashboardShell() (+24 more)

### Community 11 - "Shared UI Utils"
Cohesion: 0.06
Nodes (39): PRODUCT_TYPES, VENDORS, cn(), ProductOrganization(), Avatar, AvatarFallback, AvatarImage, Calendar() (+31 more)

### Community 12 - "Design Parser"
Cohesion: 0.33
Nodes (6): variantMatchesOptionValues(), primaryOptionComboKey(), primaryOptionDefs(), variantPrimaryOptionComboKey(), variantToOptionPayload(), subFormFromVariant()

### Community 14 - "FN6 Product Modals"
Cohesion: 0.15
Nodes (16): fn6Api, Fn6CreateModal(), Fn6DetailModal(), formatCurrency(), useImageUpload(), parseApiError(), Button(), buttonVariants (+8 more)

### Community 15 - "Variant API Routes"
Cohesion: 0.11
Nodes (34): GET(), DELETE(), PUT(), DELETE(), POST(), GET(), getShopifyToken(), applyVariantInventoryFromBody() (+26 more)

### Community 16 - "Shopify Variant Types"
Cohesion: 0.25
Nodes (21): shopifyGraphql(), convertDefaultTitleOption(), ensureTargetOptionValuesPresent(), ensureVariantsHaveOptionPositions(), isDefaultTitleOnly(), normalizeTargetTypes(), OPTION_FIELDS, productGid() (+13 more)

### Community 19 - "UI Components"
Cohesion: 0.15
Nodes (18): COLUMNS, formatCurrency(), formatNumber(), ScanPage(), ScanResult(), SKELETON_ROWS, Alert, AlertDescription (+10 more)

### Community 20 - "UI Form Controls"
Cohesion: 0.26
Nodes (11): formatCurrency(), ItemsManagementTab(), roundToNearest5(), ShopifyPublishForm(), Card, CardContent, CardDescription, CardFooter (+3 more)

### Community 22 - "Components Config"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 24 - "Shopify API Routes"
Cohesion: 0.13
Nodes (26): buildRepairSelections(), fetchFn6ByMco(), karatLabelFromFn6(), matchOptionValueFromSuffix(), OPTION_FIELDS, repairAllProductVariantOptions(), repairProductVariantOptions(), resolveMcoFromVariants() (+18 more)

### Community 25 - "Variant Cleanup"
Cohesion: 0.23
Nodes (13): POST(), cleanupAllProductVariantDiscriminators(), cleanupProductVariantDiscriminators(), hasDiscriminatorOption(), hasSuffixedValues(), OPTION_FIELDS, planSuffixStrip(), restUpdateVariantField() (+5 more)

### Community 37 - "FN6 Constants"
Cohesion: 0.14
Nodes (20): Fn6ItemMetadataPanel(), BOOL_OPTIONS, TYPE_COLORS, TYPE_LABELS, TYPE_OPTIONS, TYPE_OPTIONS_MODAL, fn6HasAssignableStock(), fn6Quantity() (+12 more)

### Community 43 - "JS Config"
Cohesion: 0.40
Nodes (4): compilerOptions, baseUrl, paths, @/*

### Community 44 - "Impeccable Onboard"
Cohesion: 0.50
Nodes (4): Premium Motion Materials, Core Web Vitals, Layout Thrashing Avoidance, View Transitions API

### Community 45 - "Vercel Config"
Cohesion: 0.50
Nodes (3): env, NEXT_PUBLIC_API_BASE_URL, framework

### Community 46 - "Impeccable Optimize"
Cohesion: 0.67
Nodes (3): Eight Interactive States, Interaction States Checklist, Error Message Formula

### Community 47 - "Impeccable Overdrive"
Cohesion: 0.67
Nodes (3): Undo Over Confirmation Dialogs, Empty State Onboarding, Button Label Problem

## Ambiguous Edges - Review These
- `Semantic Z-Index Scale` → `kg-wrap Full Viewport Container`  [AMBIGUOUS]
  shopify-page.html · relation: conceptually_related_to

## Knowledge Gaps
- **185 isolated node(s):** `BASE_URL`, `ALLOWED_HOSTS`, `OPTION_FIELDS`, `OPTION_FIELDS`, `NO_STORE_HEADERS` (+180 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Semantic Z-Index Scale` and `kg-wrap Full Viewport Container`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `cn()` connect `Shared UI Utils` to `FN6 Item Fields`, `FN6 Spec Builder`, `App Layout Shell`, `FN6 Product Modals`, `UI Components`, `UI Form Controls`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `filterCustomerOptionTypes()` connect `UI Primitives` to `FN6 Item Fields`, `Variant Model`, `FN6 Constants`, `CSP Detection`, `Shopify API Routes`, `Variant Cleanup`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `getShopifyToken()` connect `Variant API Routes` to `UI Primitives`, `Variant Cleanup`, `API Routes Axios`, `Shopify API Routes`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Are the 33 inferred relationships involving `cn()` (e.g. with `RootLayout()` and `Button()`) actually correct?**
  _`cn()` has 33 INFERRED edges - model-reasoned connections that need verification._
- **What connects `BASE_URL`, `ALLOWED_HOSTS`, `OPTION_FIELDS` to the rest of the system?**
  _201 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Primitives` be split into smaller, more focused modules?**
  _Cohesion score 0.13429951690821257 - nodes in this community are weakly interconnected._