import { spiceCatalogue } from './spiceCatalogue.js';

export const masalaCategories = [
  { slug: 'whole-spices', name: 'Whole / Raw Spices', hindiName: 'साबुत मसाले', sort: 0, status: 'active' },
  { slug: 'ground-spices', name: 'Ground Spices', hindiName: 'पिसे मसाले', sort: 1, status: 'active' },
  { slug: 'blended-masalas', name: 'Blended Masalas', hindiName: 'मिश्रित मसाले', sort: 2, status: 'active' },
];

const entries = [
  ['jeera', 'Jeera', 'जीरा', 'whole-spices', [], 'Whole cumin seeds for everyday tempering.', 'रोज़ की तड़के वाली रसोई के लिए साबुत जीरा।'],
  ['sabut-dhaniya', 'Sabut Dhaniya', 'साबुत धनिया', 'whole-spices', [], 'Whole coriander seeds for grinding and tempering.', 'पीसने और तड़का लगाने के लिए साबुत धनिया।'],
  ['kali-mirch', 'Kali Mirch', 'काली मिर्च', 'whole-spices', ['sabut-kali-mirch-whole-black-pepper'], 'Whole black peppercorns for freshly ground seasoning.', 'ताज़ा पीसकर मसाले के रूप में उपयोग करने के लिए साबुत काली मिर्च।'],
  ['laung', 'Laung', 'लौंग', 'whole-spices', [], 'Whole cloves for rice dishes and spice blends.', 'चावल के व्यंजनों और मसालों के लिए साबुत लौंग।'],
  ['dalchini', 'Dalchini', 'दालचीनी', 'whole-spices', [], 'Cinnamon sticks for curries and spiced preparations.', 'करी और मसालेदार व्यंजनों के लिए दालचीनी।'],
  ['choti-elaichi', 'Elaichi (Green Cardamom)', 'छोटी इलायची', 'whole-spices', ['elaichi-green-cardamom'], 'Green cardamom pods for cooking and desserts.', 'पकवानों और मिठाइयों के लिए छोटी हरी इलायची।'],
  ['badi-elaichi', 'Badi Elaichi / Kali Elaichi', 'बड़ी इलायची', 'whole-spices', ['kali-elaichi'], 'Whole black cardamom pods for savoury preparations.', 'नमकीन व्यंजनों के लिए साबुत बड़ी काली इलायची।'],
  ['tej-patta', 'Tej Patta', 'तेज पत्ता', 'whole-spices', [], 'Dried bay leaves for rice dishes and gravies.', 'चावल और ग्रेवी के व्यंजनों के लिए सूखे तेज पत्ते।'],
  ['ajwain', 'Ajwain', 'अजवाइन', 'whole-spices', [], 'Whole carom seeds for breads and savoury snacks.', 'रोटी और नमकीन नाश्ते के लिए साबुत अजवाइन।'],
  ['saunf', 'Saunf', 'सौंफ', 'whole-spices', [], 'Whole fennel seeds for everyday cooking.', 'रोज़ के पकवानों के लिए साबुत सौंफ।'],
  ['methi-dana', 'Methi Beej / Methi Dana', 'मेथी दाना', 'whole-spices', ['methi-beej'], 'Whole fenugreek seeds for tempering and pickles.', 'तड़के और अचार के लिए साबुत मेथी दाना।'],
  ['rai', 'Rai', 'राई', 'whole-spices', [], 'Whole mustard seeds for tempering and pickles.', 'तड़के और अचार के लिए साबुत राई।'],
  ['jaiphal', 'Jaiphal', 'जायफल', 'whole-spices', [], 'Whole nutmeg for grating into spice preparations.', 'कद्दूकस करके मसालों में उपयोग करने के लिए साबुत जायफल।'],
  ['javitri', 'Javitri', 'जावित्री', 'whole-spices', ['mace'], 'Mace spice for rice dishes and aromatic blends.', 'चावल के व्यंजनों और सुगंधित मसालों के लिए जावित्री।'],
  ['pippali', 'Pipli', 'पीपली', 'whole-spices', ['pipli', 'long-pepper'], 'Whole long pepper for spice preparations.', 'मसालों में उपयोग करने के लिए साबुत पीपली।'],
  ['sukhi-adrak', 'Soth / Saunth', 'सोंठ', 'whole-spices', ['soth', 'saunth'], 'Dried ginger pieces for grinding and spice preparations.', 'पीसने और मसालों में उपयोग करने के लिए सूखी अदरक या सोंठ।'],
  ['haldi-powder', 'Haldi Powder', 'हल्दी पाउडर', 'ground-spices', ['haldi-turmeric-powder'], 'Ground turmeric for dal and vegetable dishes.', 'दाल और सब्ज़ी के लिए पिसी हुई हल्दी।'],
  ['dhaniya-powder', 'Dhaniya Powder', 'धनिया पाउडर', 'ground-spices', ['dhaniya-coriander-powder'], 'Ground coriander for curries and everyday cooking.', 'करी और रोज़ की रसोई के लिए पिसा हुआ धनिया।'],
  ['lal-mirch-powder', 'Lal Mirch Powder', 'लाल मिर्च पाउडर', 'ground-spices', ['lal-mirch-red-chilli-powder'], 'Ground red chilli for seasoning savoury dishes.', 'नमकीन व्यंजनों में उपयोग करने के लिए पिसी हुई लाल मिर्च।'],
  ['jeera-powder', 'Jeera Powder', 'जीरा पाउडर', 'ground-spices', ['jeera-cumin-powder'], 'Ground cumin for seasoning everyday meals.', 'रोज़ के भोजन में उपयोग करने के लिए पिसा हुआ जीरा।'],
  ['garam-masala', 'Garam Masala', 'गरम मसाला', 'blended-masalas', [], 'A spice blend for finishing curries. Confirm the product formulation before publication.', 'करी में उपयोग होने वाला मसाला मिश्रण। प्रकाशन से पहले उत्पाद की सामग्री की पुष्टि करें।'],
  ['biryani-masala', 'Biryani Masala', 'बिरयानी मसाला', 'blended-masalas', [], 'A spice blend for biryani. Confirm the product formulation before publication.', 'बिरयानी के लिए मसाला मिश्रण। प्रकाशन से पहले उत्पाद की सामग्री की पुष्टि करें।'],
  ['chole-masala', 'Chole Masala', 'छोले मसाला', 'blended-masalas', [], 'A spice blend for chickpea dishes. Confirm the product formulation before publication.', 'छोले के लिए मसाला मिश्रण। प्रकाशन से पहले उत्पाद की सामग्री की पुष्टि करें।'],
  ['rajma-masala', 'Rajma Masala', 'राजमा मसाला', 'blended-masalas', [], 'A spice blend for rajma. Confirm the product formulation before publication.', 'राजमा के लिए मसाला मिश्रण। प्रकाशन से पहले उत्पाद की सामग्री की पुष्टि करें।'],
  ['sabzi-masala', 'Sabji Masala', 'सब्जी मसाला', 'blended-masalas', ['sabji-masala'], 'A dry spice blend for vegetable dishes.', 'सब्जियों के लिए मसाला मिश्रण।'],
  ['mutton-masala', 'Mutton Masala', 'मटन मसाला', 'blended-masalas', [], 'A dry spice blend for mutton dishes.', 'मटन के लिए मसाला मिश्रण।'],
  ['chicken-masala', 'Chicken Masala', 'चिकन मसाला', 'blended-masalas', ['chiken-masala'], 'A dry spice blend for chicken dishes.', 'चिकन के लिए मसाला मिश्रण।'],
];

export const masalaSeedCatalogue = entries.map(([slug, name, hindiName, category, aliases, description, hindiDescription]) => {
  const original = spiceCatalogue.find(product => product.slug === slug);
  return {
    slug, name, hindiName, category, aliases, description, hindiDescription,
    sku: original?.sku || `SON-MAS-${slug.toUpperCase()}`,
    subcategory: masalaCategories.find(item => item.slug === category).name,
    rawSpiceIngredients: category === 'blended-masalas' ? [] : [name],
    storageInstructions: 'Keep tightly closed in a cool, dry place away from sunlight and moisture.',
    packSizeOptions: ['100 g', '250 g', '500 g'],
  };
});
