export const permissionGroups = {
  Dashboard: ['dashboard.view'], Customers: ['customers.view', 'customers.export'],
  Orders: ['orders.view', 'orders.update', 'orders.cancel'], Products: ['products.view', 'products.create', 'products.update', 'products.delete'],
  Inventory: ['inventory.view', 'inventory.update'], Payments: ['payments.view', 'refunds.request', 'refunds.approve'],
  Analytics: ['analytics.view', 'analytics.export'], Shipping: ['shipping.view', 'shipping.manage'],
  Reviews: ['reviews.view', 'reviews.moderate'], Staff: ['staff.view', 'staff.invite', 'staff.manage', 'staff.revoke'],
  Owner: ['owner.access', 'owner.staff.manage', 'owner.security.manage', 'owner.permissions.manage'],
};
export const allPermissions = Object.values(permissionGroups).flat();
export const ownerOnlyPermission = key => key.startsWith('owner.') || key.startsWith('staff.');
export const operationalPermissions = allPermissions.filter(key => !ownerOnlyPermission(key));
export const defaultRoles = [
  { name: 'OWNER', label: 'Super Admin / Owner', permissions: allPermissions, ownerOnly: true },
  { name: 'ADMIN', label: 'Administrator', permissions: operationalPermissions },
  { name: 'ORDER_MANAGER', label: 'Order manager', permissions: ['dashboard.view', 'orders.view', 'orders.update', 'orders.cancel', 'customers.view', 'shipping.view', 'shipping.manage'] },
  { name: 'INVENTORY_MANAGER', label: 'Inventory manager', permissions: ['dashboard.view', 'products.view', 'inventory.view', 'inventory.update'] },
  { name: 'SALES_MANAGER', label: 'Sales manager', permissions: ['dashboard.view', 'orders.view', 'analytics.view', 'analytics.export', 'payments.view'] },
  { name: 'SUPPORT_MANAGER', label: 'Support manager', permissions: ['dashboard.view', 'customers.view', 'orders.view', 'reviews.view', 'reviews.moderate'] },
];
