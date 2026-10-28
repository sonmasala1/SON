import Product from '../models/Product.js';
import Subscriber from '../models/Subscriber.js';
import Category from '../models/Category.js';
import ProductVariant from '../models/ProductVariant.js';
import Cart from '../models/Cart.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Review from '../models/Review.js';
import InventoryReservation from '../models/InventoryReservation.js';
import { administrationModels, AdminRole, AdminPermission } from '../models/administration.js';
import { permissionGroups, ownerOnlyPermission, defaultRoles } from './permissions.js';
import { CustomerSession, CustomerOtp, CustomerAuthThrottle } from '../models/customerAuthentication.js';
import { EmailOtp, EmailThrottle } from '../models/emailAuthentication.js';
import GoogleLoginAttempt from '../models/GoogleLoginAttempt.js';
import Wishlist from '../models/Wishlist.js';

export async function initializeModels() {
  // Create collections and indexes only after the connection is established.
  for (const model of [Product, Subscriber, Category, ProductVariant, Cart, User, Wishlist, Order, Payment, Review, InventoryReservation, CustomerSession, CustomerOtp, CustomerAuthThrottle, EmailOtp, EmailThrottle, GoogleLoginAttempt, ...administrationModels]) {
    await model.createCollection();
    await model.createIndexes();
  }
  // Install the replacement unique email index before removing the legacy non-sparse index.
  const indexes = await User.collection.indexes();
  if (indexes.some(index => index.name === 'email_1' && !index.partialFilterExpression)) await User.collection.dropIndex('email_1');
  for (const [group, keys] of Object.entries(permissionGroups)) for (const key of keys) await AdminPermission.updateOne({ key }, { $setOnInsert: { key, group, ownerOnly: ownerOnlyPermission(key) } }, { upsert: true });
  for (const role of defaultRoles) await AdminRole.updateOne({ name: role.name }, { $setOnInsert: role }, { upsert: true });
}
