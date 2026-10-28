const groups = [
  {
    category: 'whole-spices',
    subcategory: 'Whole / Raw Spices',
    entries: [
      ['Jeera', 'जीरा'], ['Shah Jeera', 'शाही जीरा'], ['Sabut Dhaniya', 'साबुत धनिया'],
      ['Kali Mirch', 'काली मिर्च'], ['Safed Mirch', 'सफेद मिर्च'], ['Laung', 'लौंग'],
      ['Dalchini', 'दालचीनी'], ['Choti Elaichi', 'छोटी इलायची'], ['Badi Elaichi', 'बड़ी इलायची'],
      ['Tej Patta', 'तेज पत्ता'], ['Chakri Phool', 'चक्र फूल'], ['Jaiphal', 'जायफल'],
      ['Javitri', 'जावित्री'], ['Sabut Lal Mirch', 'साबुत लाल मिर्च'], ['Kashmiri Lal Mirch', 'कश्मीरी लाल मिर्च'],
      ['Sabut Haldi', 'साबुत हल्दी'], ['Sukhi Adrak', 'सूखी अदरक'], ['Ajwain', 'अजवाइन'],
      ['Rai', 'राई'], ['Sarson', 'सरसों'], ['Methi Dana', 'मेथी दाना'], ['Saunf', 'सौंफ'],
      ['Kalonji', 'कलौंजी'], ['Hing', 'हींग'], ['Kabab Chini', 'कबाब चीनी'],
      ['Nagkesar', 'नागकेसर'], ['Pippali', 'पीपली'], ['Stone Flower', 'पत्थर फूल'],
      ['Anardana', 'अनारदाना'], ['Amchur Slices', 'अमचूर स्लाइस'],
    ],
  },
  {
    category: 'seeds-herbs',
    subcategory: 'Seeds and Herbs',
    entries: [
      ['Til', 'तिल'], ['Kala Til', 'काला तिल'], ['Khus Khus', 'खसखस'],
      ['Kasuri Methi', 'कसूरी मेथी'], ['Curry Leaves', 'करी पत्ता'], ['Dried Pudina', 'सूखा पुदीना'],
      ['Dried Coriander Leaves', 'सूखी धनिया पत्ती'], ['Basil', 'तुलसी'], ['Oregano', 'ओरिगैनो'],
      ['Rosemary', 'रोज़मेरी'], ['Thyme', 'थाइम'], ['Flax Seeds', 'अलसी के बीज'],
      ['Chia Seeds', 'चिया बीज'], ['Pumpkin Seeds', 'कद्दू के बीज'], ['Sunflower Seeds', 'सूरजमुखी के बीज'],
      ['Sabja Seeds', 'सब्जा बीज'],
    ],
  },
  {
    category: 'ground-spices',
    subcategory: 'Ground Spices',
    entries: [
      ['Haldi Powder', 'हल्दी पाउडर'], ['Dhaniya Powder', 'धनिया पाउडर'], ['Lal Mirch Powder', 'लाल मिर्च पाउडर'],
      ['Kashmiri Mirch Powder', 'कश्मीरी मिर्च पाउडर'], ['Jeera Powder', 'जीरा पाउडर'], ['Kali Mirch Powder', 'काली मिर्च पाउडर'],
      ['Safed Mirch Powder', 'सफेद मिर्च पाउडर'], ['Saunf Powder', 'सौंफ पाउडर'], ['Amchur Powder', 'अमचूर पाउडर'],
      ['Ginger Powder', 'अदरक पाउडर'], ['Garlic Powder', 'लहसुन पाउडर'], ['Onion Powder', 'प्याज पाउडर'],
      ['Dalchini Powder', 'दालचीनी पाउडर'], ['Elaichi Powder', 'इलायची पाउडर'], ['Laung Powder', 'लौंग पाउडर'],
      ['Methi Powder', 'मेथी पाउडर'], ['Mustard Powder', 'सरसों पाउडर'], ['Anardana Powder', 'अनारदाना पाउडर'],
      ['Javitri Powder', 'जावित्री पाउडर'], ['Jaiphal Powder', 'जायफल पाउडर'],
    ],
  },
  {
    category: 'blended-masalas',
    subcategory: 'Blended Masalas',
    entries: [
      ['Garam Masala', 'गरम मसाला'], ['Kitchen King Masala', 'किचन किंग मसाला'], ['Sabzi Masala', 'सब्ज़ी मसाला'],
      ['Chaat Masala', 'चाट मसाला'], ['Chole Masala', 'छोले मसाला'], ['Rajma Masala', 'राजमा मसाला'],
      ['Pav Bhaji Masala', 'पाव भाजी मसाला'], ['Sambhar Masala', 'सांभर मसाला'], ['Rasam Powder', 'रसम पाउडर'],
      ['Biryani Masala', 'बिरयानी मसाला'], ['Pulao Masala', 'पुलाव मसाला'], ['Chicken Masala', 'चिकन मसाला'],
      ['Meat Masala', 'मीट मसाला'], ['Fish Curry Masala', 'फिश करी मसाला'], ['Tandoori Masala', 'तंदूरी मसाला'],
      ['Paneer Masala', 'पनीर मसाला'], ['Shahi Paneer Masala', 'शाही पनीर मसाला'],
      ['Butter Chicken Masala', 'बटर चिकन मसाला'], ['Dal Makhani Masala', 'दाल मखनी मसाला'],
      ['Dal Tadka Masala', 'दाल तड़का मसाला'], ['Aloo Sabzi Masala', 'आलू सब्ज़ी मसाला'],
      ['Bhindi Masala', 'भिंडी मसाला'], ['Kadhi Masala', 'कढ़ी मसाला'], ['Pickle Masala', 'अचार मसाला'],
      ['Tea Masala', 'चाय मसाला'], ['Jaljeera Masala', 'जलजीरा मसाला'], ['Pani Puri Masala', 'पानी पुरी मसाला'],
      ['Dahi Vada Masala', 'दही वड़ा मसाला'], ['Korma Masala', 'कोरमा मसाला'], ['Nihari Masala', 'निहारी मसाला'],
      ['Achari Masala', 'अचारी मसाला'], ['South Indian Curry Masala', 'साउथ इंडियन करी मसाला'],
    ],
  },
  {
    category: 'specialty-spices',
    subcategory: 'Specialty Spices',
    entries: [
      ['Saffron', 'केसर'], ['Black Cardamom Seeds', 'काली इलायची के बीज'],
      ['Green Cardamom Seeds', 'हरी इलायची के बीज'], ['Smoked Paprika', 'स्मोक्ड पपरिका'],
      ['Sweet Paprika', 'स्वीट पपरिका'], ['Sumac', 'सुमाक'], ['Sichuan Pepper', 'सिचुआन पेपर'],
      ['Long Pepper', 'लंबी मिर्च'], ['Mace', 'जावित्री'], ['Turmeric Fingers', 'हल्दी की गांठ'],
      ['Black Cumin', 'काला जीरा'], ['White Cumin', 'सफेद जीरा'],
    ],
  },
];

const sizeOptions = {
  'whole-spices': ['25g', '50g', '100g', '200g', '500g', '1kg'],
  'seeds-herbs': ['25g', '50g', '100g', '200g', '500g'],
  'ground-spices': ['50g', '100g', '200g', '500g', '1kg'],
  'blended-masalas': ['25g', '50g', '100g', '200g', '500g'],
  'specialty-spices': ['25g', '50g', '100g', '200g'],
};

const knownBotanicalNames = {
  Jeera: 'Cuminum cyminum',
  'Sabut Dhaniya': 'Coriandrum sativum',
  'Kali Mirch': 'Piper nigrum',
  'Safed Mirch': 'Piper nigrum',
  Laung: 'Syzygium aromaticum',
  Dalchini: 'Cinnamomum verum',
  'Choti Elaichi': 'Elettaria cardamomum',
  'Badi Elaichi': 'Amomum subulatum',
  'Tej Patta': 'Cinnamomum tamala',
  'Chakri Phool': 'Illicium verum',
  Jaiphal: 'Myristica fragrans',
  Javitri: 'Myristica fragrans',
  Ajwain: 'Trachyspermum ammi',
  Methi: 'Trigonella foenum-graecum',
  Saunf: 'Foeniculum vulgare',
  Kalonji: 'Nigella sativa',
  'Black Cumin': 'Nigella sativa',
  Hing: 'Ferula assa-foetida',
  'Long Pepper': 'Piper longum',
  Haldi: 'Curcuma longa',
  'Curry Leaves': 'Murraya koenigii',
  Basil: 'Ocimum basilicum',
  Oregano: 'Origanum vulgare',
  Rosemary: 'Salvia rosmarinus',
  Thyme: 'Thymus vulgaris',
  'Flax Seeds': 'Linum usitatissimum',
  'Chia Seeds': 'Salvia hispanica',
  'Pumpkin Seeds': 'Cucurbita pepo',
  'Sunflower Seeds': 'Helianthus annuus',
  Saffron: 'Crocus sativus',
};

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const entries = groups.flatMap(group => group.entries.map(([name, hindiName], index) => {
  const slug = slugify(name);
  const isBlend = group.category === 'blended-masalas';
  const rawIngredient = isBlend ? [] : [name];
  const sizes = name === 'Saffron' ? ['1g', '2g', '5g'] : sizeOptions[group.category];
  return {
    name,
    hindiName,
    slug,
    sku: `SON-${group.category.toUpperCase().slice(0, 3)}-${String(index + 1).padStart(3, '0')}-${slug.slice(0, 12).toUpperCase()}`,
    category: group.category,
    subcategory: group.subcategory,
    description: '',
    hindiDescription: '',
    ingredients: rawIngredient,
    rawSpiceIngredients: rawIngredient,
    ingredientComposition: [],
    ingredientCompositionVerified: false,
    ingredientCompositionSource: '',
    botanicalName: knownBotanicalNames[name] || '',
    origin: '',
    originVerificationStatus: 'unknown',
    originVerificationSource: '',
    packSizeOptions: sizes,
    availablePackSizes: [],
    variants: [],
    image: '',
    images: [],
    usageInstructions: '',
    storageInstructions: '',
    shelfLife: '',
    shelfLifeVerificationStatus: 'unknown',
    shelfLifeVerificationSource: '',
    allergenInformation: '',
    inventoryStatus: 'unknown',
    status: 'draft',
  };
}));

const selectedProducts = [
  {
    "slug": "jeera",
    "name": "Jeera",
    "hindiName": "\u091c\u0940\u0930\u093e",
    "category": "whole-spices",
    "sku": "SON-WHO-001-JEERA"
  },
  {
    "slug": "sabut-dhaniya",
    "name": "Sabut Dhaniya",
    "hindiName": "\u0938\u093e\u092c\u0941\u0924 \u0927\u0928\u093f\u092f\u093e",
    "category": "whole-spices",
    "sku": "SON-WHO-003-SABUT-DHANIY"
  },
  {
    "slug": "kali-mirch",
    "name": "Kali Mirch",
    "hindiName": "\u0915\u093e\u0932\u0940 \u092e\u093f\u0930\u094d\u091a",
    "category": "whole-spices",
    "sku": "SON-WHO-004-KALI-MIRCH"
  },
  {
    "slug": "laung",
    "name": "Laung",
    "hindiName": "\u0932\u094c\u0902\u0917",
    "category": "whole-spices",
    "sku": "SON-WHO-006-LAUNG"
  },
  {
    "slug": "dalchini",
    "name": "Dalchini",
    "hindiName": "\u0926\u093e\u0932\u091a\u0940\u0928\u0940",
    "category": "whole-spices",
    "sku": "SON-WHO-007-DALCHINI"
  },
  {
    "slug": "choti-elaichi",
    "name": "Elaichi (Green Cardamom)",
    "hindiName": "\u091b\u094b\u091f\u0940 \u0907\u0932\u093e\u092f\u091a\u0940",
    "category": "whole-spices",
    "sku": "SON-WHO-008-CHOTI-ELAICH"
  },
  {
    "slug": "badi-elaichi",
    "name": "Badi Elaichi / Kali Elaichi",
    "hindiName": "\u092c\u0921\u093c\u0940 \u0907\u0932\u093e\u092f\u091a\u0940",
    "category": "whole-spices",
    "sku": "SON-WHO-009-BADI-ELAICHI"
  },
  {
    "slug": "tej-patta",
    "name": "Tej Patta",
    "hindiName": "\u0924\u0947\u091c \u092a\u0924\u094d\u0924\u093e",
    "category": "whole-spices",
    "sku": "SON-WHO-010-TEJ-PATTA"
  },
  {
    "slug": "ajwain",
    "name": "Ajwain",
    "hindiName": "\u0905\u091c\u0935\u093e\u0907\u0928",
    "category": "whole-spices",
    "sku": "SON-WHO-018-AJWAIN"
  },
  {
    "slug": "saunf",
    "name": "Saunf",
    "hindiName": "\u0938\u094c\u0902\u092b",
    "category": "whole-spices",
    "sku": "SON-WHO-022-SAUNF"
  },
  {
    "slug": "methi-dana",
    "name": "Methi Beej / Methi Dana",
    "hindiName": "\u092e\u0947\u0925\u0940 \u0926\u093e\u0928\u093e",
    "category": "whole-spices",
    "sku": "SON-WHO-021-METHI-DANA"
  },
  {
    "slug": "rai",
    "name": "Rai",
    "hindiName": "\u0930\u093e\u0908",
    "category": "whole-spices",
    "sku": "SON-WHO-019-RAI"
  },
  {
    "slug": "jaiphal",
    "name": "Jaiphal",
    "hindiName": "\u091c\u093e\u092f\u092b\u0932",
    "category": "whole-spices",
    "sku": "SON-WHO-012-JAIPHAL"
  },
  {
    "slug": "javitri",
    "name": "Javitri",
    "hindiName": "\u091c\u093e\u0935\u093f\u0924\u094d\u0930\u0940",
    "category": "whole-spices",
    "sku": "SON-WHO-013-JAVITRI"
  },
  {
    "slug": "pippali",
    "name": "Pipli",
    "hindiName": "\u092a\u0940\u092a\u0932\u0940",
    "category": "whole-spices",
    "sku": "SON-WHO-027-PIPPALI"
  },
  {
    "slug": "sukhi-adrak",
    "name": "Soth / Saunth",
    "hindiName": "\u0938\u094b\u0902\u0920",
    "category": "whole-spices",
    "sku": "SON-WHO-017-SUKHI-ADRAK"
  },
  {
    "slug": "haldi-powder",
    "name": "Haldi Powder",
    "hindiName": "\u0939\u0932\u094d\u0926\u0940 \u092a\u093e\u0909\u0921\u0930",
    "category": "ground-spices",
    "sku": "SON-GRO-001-HALDI-POWDER"
  },
  {
    "slug": "dhaniya-powder",
    "name": "Dhaniya Powder",
    "hindiName": "\u0927\u0928\u093f\u092f\u093e \u092a\u093e\u0909\u0921\u0930",
    "category": "ground-spices",
    "sku": "SON-GRO-002-DHANIYA-POWD"
  },
  {
    "slug": "lal-mirch-powder",
    "name": "Lal Mirch Powder",
    "hindiName": "\u0932\u093e\u0932 \u092e\u093f\u0930\u094d\u091a \u092a\u093e\u0909\u0921\u0930",
    "category": "ground-spices",
    "sku": "SON-GRO-003-LAL-MIRCH-PO"
  },
  {
    "slug": "jeera-powder",
    "name": "Jeera Powder",
    "hindiName": "\u091c\u0940\u0930\u093e \u092a\u093e\u0909\u0921\u0930",
    "category": "ground-spices",
    "sku": "SON-GRO-005-JEERA-POWDER"
  },
  {
    "slug": "garam-masala",
    "name": "Garam Masala",
    "hindiName": "\u0917\u0930\u092e \u092e\u0938\u093e\u0932\u093e",
    "category": "blended-masalas",
    "sku": "SON-BLE-001-GARAM-MASALA"
  },
  {
    "slug": "biryani-masala",
    "name": "Biryani Masala",
    "hindiName": "\u092c\u093f\u0930\u092f\u093e\u0928\u0940 \u092e\u0938\u093e\u0932\u093e",
    "category": "blended-masalas",
    "sku": "SON-BLE-010-BIRYANI-MASA"
  },
  {
    "slug": "chole-masala",
    "name": "Chole Masala",
    "hindiName": "\u091b\u094b\u0932\u0947 \u092e\u0938\u093e\u0932\u093e",
    "category": "blended-masalas",
    "sku": "SON-BLE-005-CHOLE-MASALA"
  },
  {
    "slug": "rajma-masala",
    "name": "Rajma Masala",
    "hindiName": "\u0930\u093e\u091c\u092e\u093e \u092e\u0938\u093e\u0932\u093e",
    "category": "blended-masalas",
    "sku": "SON-BLE-006-RAJMA-MASALA"
  },
  {
    "slug": "sabzi-masala",
    "name": "Sabji Masala",
    "hindiName": "सब्जी मसाला",
    "category": "blended-masalas",
    "sku": "SON-BLE-003-SABZI-MASALA"
  },
  {
    "slug": "mutton-masala",
    "name": "Mutton Masala",
    "hindiName": "मटन मसाला",
    "category": "blended-masalas",
    "sku": "SON-MAS-MUTTON-MASALA"
  },
  {
    "slug": "chicken-masala",
    "name": "Chicken Masala",
    "hindiName": "चिकन मसाला",
    "category": "blended-masalas",
    "sku": "SON-BLE-012-CHICKEN-MASA"
  }
];
export const spiceCatalogue = selectedProducts.map(identity => {
  const template = entries.find(product => product.slug === identity.slug) || entries.find(product => product.slug === 'meat-masala');
  return { ...template, ...identity, ingredients: identity.category === 'blended-masalas' ? [] : [identity.name], rawSpiceIngredients: identity.category === 'blended-masalas' ? [] : [identity.name], packSizeOptions: ['100 g', '250 g', '500 g'] };
});
export const spiceCatalogueCategories = groups.filter(group => ['whole-spices', 'ground-spices', 'blended-masalas'].includes(group.category)).map(({ category, subcategory }, sort) => ({
  name: subcategory,
  hindiName: {
    'Whole / Raw Spices': 'साबुत मसाले',
    'Seeds and Herbs': 'बीज और जड़ी-बूटियाँ',
    'Ground Spices': 'पिसे मसाले',
    'Blended Masalas': 'मिश्रित मसाले',
    'Specialty Spices': 'विशेष मसाले',
  }[subcategory],
  slug: category,
  sort,
}));
