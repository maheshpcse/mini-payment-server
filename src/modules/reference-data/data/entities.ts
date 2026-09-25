export interface EntitySeed {
  code: string;
  type: 'MERCHANT' | 'BILLER' | 'TELECOM_OPERATOR';
  name: string;
  /** spending_category for merchants, bill_category for billers and operators */
  category: string;
  vpa: string | null;
  city: string | null;
  attributes: Record<string, unknown>;
  active: boolean;
  sandbox: true;
}

type Seed = Omit<EntitySeed, 'active' | 'sandbox' | 'attributes' | 'vpa' | 'city'> &
  Partial<Pick<EntitySeed, 'attributes' | 'vpa' | 'city'>>;

const seed = (entity: Seed): EntitySeed => ({ vpa: null, city: null, attributes: {}, ...entity, active: true, sandbox: true });

/**
 * Fictional counterparties for the sandbox. Names are invented and must not
 * resemble real businesses; VPAs use the sandbox-only `@minipay` handle.
 */
export const ENTITIES: EntitySeed[] = [
  seed({ code: 'MER_CHAI_CORNER', type: 'MERCHANT', name: 'Chai Corner', category: 'FOOD', vpa: 'chaicorner@minipay', city: 'Bengaluru' }),
  seed({ code: 'MER_FRESH_BASKET', type: 'MERCHANT', name: 'Fresh Basket Grocers', category: 'GROCERIES', vpa: 'freshbasket@minipay', city: 'Pune' }),
  seed({ code: 'MER_PAGE_TURNER', type: 'MERCHANT', name: 'Page Turner Books', category: 'EDUCATION', vpa: 'pageturner@minipay', city: 'Kolkata' }),
  seed({ code: 'MER_CITY_CABS', type: 'MERCHANT', name: 'City Cabs Demo', category: 'TRAVEL', vpa: 'citycabs@minipay', city: 'Mumbai' }),
  seed({ code: 'MER_WELLNESS_PHARMA', type: 'MERCHANT', name: 'Wellness Pharmacy', category: 'HEALTH', vpa: 'wellness@minipay', city: 'Hyderabad' }),
  seed({ code: 'MER_STARLIGHT_CINEMA', type: 'MERCHANT', name: 'Starlight Cinemas', category: 'ENTERTAINMENT', vpa: 'starlight@minipay', city: 'Chennai' }),
  seed({ code: 'MER_THREADS_STUDIO', type: 'MERCHANT', name: 'Threads Studio', category: 'SHOPPING', vpa: 'threads@minipay', city: 'Jaipur' }),
  seed({
    code: 'BIL_BRIGHTGRID_POWER',
    type: 'BILLER',
    name: 'BrightGrid Power (Sandbox)',
    category: 'ELECTRICITY',
    attributes: { customerIdLabel: 'Consumer number', customerIdPattern: '^\\d{10}$', supportsBillFetch: true },
  }),
  seed({
    code: 'BIL_CLEARFLOW_WATER',
    type: 'BILLER',
    name: 'ClearFlow Water Board (Sandbox)',
    category: 'WATER',
    attributes: { customerIdLabel: 'Connection ID', customerIdPattern: '^[A-Z]{2}\\d{8}$', supportsBillFetch: true },
  }),
  seed({
    code: 'BIL_BLUEFLAME_GAS',
    type: 'BILLER',
    name: 'BlueFlame Piped Gas (Sandbox)',
    category: 'GAS',
    attributes: { customerIdLabel: 'BP number', customerIdPattern: '^\\d{12}$', supportsBillFetch: true },
  }),
  seed({
    code: 'BIL_SWIFTNET_FIBER',
    type: 'BILLER',
    name: 'SwiftNet Fiber (Sandbox)',
    category: 'BROADBAND',
    attributes: { customerIdLabel: 'Account number', customerIdPattern: '^\\d{8,12}$', supportsBillFetch: true },
  }),
  seed({
    code: 'BIL_SKYVIEW_DTH',
    type: 'BILLER',
    name: 'SkyView DTH (Sandbox)',
    category: 'DTH',
    attributes: { customerIdLabel: 'Subscriber ID', customerIdPattern: '^\\d{10}$', supportsBillFetch: false },
  }),
  seed({
    code: 'BIL_SURESHIELD_INSURE',
    type: 'BILLER',
    name: 'SureShield Insurance (Sandbox)',
    category: 'INSURANCE',
    attributes: { customerIdLabel: 'Policy number', customerIdPattern: '^[A-Z0-9]{8,16}$', supportsBillFetch: true },
  }),
  seed({
    code: 'TEL_NOVA_MOBILE',
    type: 'TELECOM_OPERATOR',
    name: 'Nova Mobile (Sandbox)',
    category: 'MOBILE_PREPAID',
    attributes: { plansMinor: [19_900, 29_900, 66_600], circles: ['ALL_INDIA'] },
  }),
  seed({
    code: 'TEL_ORBIT_TELECOM',
    type: 'TELECOM_OPERATOR',
    name: 'Orbit Telecom (Sandbox)',
    category: 'MOBILE_PREPAID',
    attributes: { plansMinor: [15_500, 23_900, 71_900], circles: ['ALL_INDIA'] },
  }),
  seed({
    code: 'TEL_PULSE_CONNECT',
    type: 'TELECOM_OPERATOR',
    name: 'Pulse Connect (Sandbox)',
    category: 'MOBILE_POSTPAID',
    attributes: { customerIdLabel: 'Mobile number', customerIdPattern: '^[6-9]\\d{9}$', supportsBillFetch: true },
  }),
];
