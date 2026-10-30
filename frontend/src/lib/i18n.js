import { hindiMessages, englishOverrides } from './messages';
import { staffHindiMessages } from './staff-messages';
const messages = { ...hindiMessages, ...staffHindiMessages };
const normalized = new Map(Object.entries(messages).map(([key, value]) => [key.toLocaleLowerCase('en'), value]));
const patterns = [
  [/^Shopping cart, (\d+) items$/, count => `शॉपिंग कार्ट, ${count} उत्पाद`],
  [/^Wishlist, (\d+) items$/, count => `पसंदीदा सूची, ${count} उत्पाद`],
  [/^(?:Email verification|Verification) code digit (\d+)$/, digit => `सत्यापन कोड का अंक ${digit}`],
  [/^Resend OTP in (\d+)s$/, seconds => `${seconds} सेकंड में ओटीपी दोबारा भेजें`],
  [/^(\d+(?:\.\d+)?)\s*g$/, weight => `${weight} ग्राम`],
  [/^(\d+(?:\.\d+)?)\s*kg$/, weight => `${weight} किलोग्राम`],
  [/^Decrease (.+)$/, name => `${translate(name, 'hi')} की मात्रा घटाएँ`],
  [/^Increase (.+)$/, name => `${translate(name, 'hi')} की मात्रा बढ़ाएँ`],
  [/^Quantity for (.+)$/, name => `${translate(name, 'hi')} की मात्रा`],
  [/^Remove (.+) from wishlist$/, name => `${translate(name, 'hi')} पसंदीदा सूची से हटाएँ`],
  [/^Save (.+) to wishlist$/, name => `${translate(name, 'hi')} पसंदीदा सूची में जोड़ें`],
  [/^Remove (.+)$/, name => `${translate(name, 'hi')} हटाएँ`],
  [/^(.+) added to your bag$/, name => `${translate(name, 'hi')} आपके बैग में जुड़ गया`],
  [/^Delivery is free from (.+)\.$/, amount => `${amount} से डिलीवरी मुफ़्त है।`],
  [/^(\d+) available$/, count => `${count} उपलब्ध`],
  [/^Stock for (.+)$/, sku => `${sku} का स्टॉक`],
  [/^Fulfillment for (.+)$/, id => `${id} की पूर्ति`],
  [/^Go to (.+)$/, role => `${translate(role, 'hi')} पर जाएँ`],
  [/^Sign out of (.+)$/, realm => `${translate(realm, 'hi')} से लॉग आउट करें`],
  [/^(.+) permissions$/, role => `${translate(role, 'hi')} की अनुमतियाँ`],
  [/^(.+) stars?$/, count => `${count} सितारे`],
  [/^Review (\d+)$/, count => `समीक्षा ${count}`],
  [/^Show review (\d+)$/, count => `समीक्षा ${count} दिखाएँ`],
  [/^(\d+) out of 5 stars$/, count => `5 में से ${count} सितारे`],
  [/^(\d+) of (\d+)$/, (position, total) => `${total} में से ${position}`],
  [/^Please wait (\d+) seconds before requesting another code\.$/, seconds => `नया कोड माँगने से पहले ${seconds} सेकंड प्रतीक्षा करें।`],
  [/^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec) (\d{4})$/, (day, month, year) => `${day} ${{ Jan: 'जनवरी', Feb: 'फ़रवरी', Mar: 'मार्च', Apr: 'अप्रैल', May: 'मई', Jun: 'जून', Jul: 'जुलाई', Aug: 'अगस्त', Sep: 'सितंबर', Sept: 'सितंबर', Oct: 'अक्टूबर', Nov: 'नवंबर', Dec: 'दिसंबर' }[month]} ${year}`],
];
export function translate(value, locale = 'en', { error = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) return value;
  const key = value.replace(/\s+/gu, ' ').trim();
  const prefix = value.match(/^\s*/u)[0], suffix = value.match(/\s*$/u)[0];
  if (locale === 'en') return Object.hasOwn(englishOverrides, key) ? prefix + englishOverrides[key] + suffix : value;
  const direct = messages[key] || normalized.get(key.toLocaleLowerCase('en'));
  if (typeof direct === 'string') return prefix + direct + suffix;
  if (/^[a-z]+\.(?:[a-z]+\.)?[a-z]+$/.test(key)) {
    const permissionWords = { dashboard: 'डैशबोर्ड', customers: 'ग्राहक', orders: 'ऑर्डर', products: 'उत्पाद', inventory: 'स्टॉक', payments: 'भुगतान', refunds: 'वापसी भुगतान', analytics: 'विश्लेषण', shipping: 'शिपिंग', reviews: 'समीक्षाएँ', staff: 'कर्मचारी', owner: 'मालिक', security: 'सुरक्षा', permissions: 'अनुमतियाँ', view: 'देखें', create: 'बनाएँ', update: 'बदलें', delete: 'हटाएँ', export: 'निर्यात', cancel: 'रद्द करें', request: 'अनुरोध', approve: 'मंज़ूरी दें', manage: 'प्रबंधन', moderate: 'समीक्षा प्रबंधन', access: 'पहुँच', invite: 'आमंत्रित करें', revoke: 'रद्द करें' };
    const parts = key.split('.'); if (parts.every(part => permissionWords[part])) return parts.map(part => permissionWords[part]).join(' · ');
  }
  if (key.startsWith('HTTP ')) return translate(key.replace(/^HTTP \d+:\s*/, ''), locale, { error });
  for (const [pattern, render] of patterns) { const match = key.match(pattern); if (match) return prefix + render(...match.slice(1)) + suffix; }
  if (error && /[a-z]/i.test(key)) return 'जानकारी जाँचें और फिर से प्रयास करें। समस्या बनी रहे तो सहायता से संपर्क करें।';
  return value;
}
export function validationMessage(validity, locale) {
  if (locale === 'hi') {
    if (validity.valueMissing) return 'कृपया यह जानकारी भरें।';
    if (validity.typeMismatch) return 'कृपया सही प्रारूप में जानकारी भरें।';
    if (validity.tooShort || validity.tooLong) return 'कृपया सही लंबाई में जानकारी भरें।';
    if (validity.rangeOverflow || validity.rangeUnderflow) return 'कृपया अनुमत सीमा में संख्या भरें।';
    return 'कृपया सही जानकारी भरें।';
  }
  return validity.valueMissing ? 'Please fill in this field.' : 'Please enter a valid value.';
}
export function productName(product, locale) {
  if (locale === 'en') return product.name;
  if (product.hindiName?.trim()) return product.hindiName;
  const translated = translate(product.name, 'hi');
  return translated !== product.name ? translated : 'मसाला';
}
export function productDescription(product, locale) {
  if (locale === 'en') return product.description;
  if (product.hindiDescription?.trim()) return product.hindiDescription;
  const translated = translate(product.description, 'hi');
  return translated !== product.description ? translated : 'इस उत्पाद का विस्तृत विवरण जल्द उपलब्ध होगा।';
}
