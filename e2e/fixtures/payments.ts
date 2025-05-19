/**
 * Test fixtures for payments
 */

export const payments = [
  {
    id: 'test-payment-123',
    registrationId: 'test-reg-123',
    eventId: 'test-event-1',
    amount: 35.0,
    currency: 'EUR',
    status: 'pending',
    paymentMethod: 'bank',
    createdAt: new Date().toISOString(),
    transactionId: 'txn_test_123',
    redirectUrl: 'http://localhost:3000/p/success?payment=test-payment-123',
  },
  {
    id: 'test-payment-456',
    registrationId: 'test-reg-456',
    eventId: 'test-event-2',
    amount: 40.0,
    currency: 'EUR',
    status: 'completed',
    paymentMethod: 'card',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    transactionId: 'txn_test_456',
    redirectUrl: 'http://localhost:3000/p/success?payment=test-payment-456',
  },
]

// Mock payment provider response
export const paymentProviderResponse = {
  transactionId: '97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6',
  href: 'https://pay.paytrail.com/pay/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6',
  reference: '8230247567',
  terms:
    'Valitsemalla maksutavan hyväksyt <a href="https://www.paytrail.com/kuluttaja/maksupalveluehdot" target="_blank">maksupalveluehdot</a>',
  groups: [
    {
      id: 'bank',
      name: 'Pankkimaksutavat',
      icon: 'https://resources.paytrail.com/images/payment-group-icons/bank.png',
      svg: 'https://resources.paytrail.com/images/payment-group-icons/bank.svg',
    },
    {
      id: 'mobile',
      name: 'Mobiilimaksutavat',
      icon: 'https://resources.paytrail.com/images/payment-group-icons/mobile.png',
      svg: 'https://resources.paytrail.com/images/payment-group-icons/mobile.svg',
    },
    {
      id: 'creditcard',
      name: 'Korttimaksutavat',
      icon: 'https://resources.paytrail.com/images/payment-group-icons/creditcard.png',
      svg: 'https://resources.paytrail.com/images/payment-group-icons/creditcard.svg',
    },
    {
      id: 'credit',
      name: 'Lasku- ja osamaksutavat',
      icon: 'https://resources.paytrail.com/images/payment-group-icons/credit.png',
      svg: 'https://resources.paytrail.com/images/payment-group-icons/credit.svg',
    },
  ],
  providers: [
    {
      name: 'OP',
      url: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/osuuspankki/loading-and-redirect',
      icon: 'https://resources.paytrail.com/images/payment-method-logos/osuuspankki.png',
      svg: 'https://resources.paytrail.com/images/payment-method-logos/osuuspankki.svg',
      id: 'osuuspankki',
      group: 'bank',
      parameters: [
        {
          name: 'checkout-transaction-id',
          value: '97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6',
        },
        {
          name: 'checkout-account',
          value: '695861',
        },
        {
          name: 'checkout-method',
          value: 'POST',
        },
        {
          name: 'checkout-algorithm',
          value: 'sha256',
        },
        {
          name: 'checkout-timestamp',
          value: '2025-05-17T18:50:33.869Z',
        },
        {
          name: 'checkout-nonce',
          value: 'cf5afa89-fc11-4405-913a-f6fb3dcad39d',
        },
        {
          name: 'signature',
          value: '079480ce3a6bb5aacde9fd87051bb6bbbbd1b106df66ab8ef1dc7f35d29d94ca',
        },
      ],
    },
    {
      name: 'Nordea',
      url: 'https://epmt.nordea.fi/cgi-bin/SOLOPM01',
      icon: 'https://resources.paytrail.com/images/payment-method-logos/nordea.png',
      svg: 'https://resources.paytrail.com/images/payment-method-logos/nordea.svg',
      id: 'nordea',
      group: 'bank',
      parameters: [
        {
          name: 'VERSION',
          value: '0005',
        },
        {
          name: 'CONFIRM',
          value: 'YES',
        },
        {
          name: 'CUR',
          value: 'EUR',
        },
        {
          name: 'ALG',
          value: '02',
        },
        {
          name: 'DATE',
          value: 'EXPRESS',
        },
        {
          name: 'RCV_ID',
          value: '12345678',
        },
        {
          name: 'RCV_ACCOUNT',
          value: '29501800000014',
        },
        {
          name: 'RCV_NAME',
          value: 'Paytrail Oyj',
        },
        {
          name: 'KEYVERS',
          value: '0001',
        },
        {
          name: 'AMOUNT',
          value: '50.00',
        },
        {
          name: 'STAMP',
          value: '822700317',
        },
        {
          name: 'REF',
          value: '8230247567',
        },
        {
          name: 'LANGUAGE',
          value: '1',
        },
        {
          name: 'MSG',
          value: 'Shop-in-Shop test shop / lktHDjLcPw:n2Nf8bwpYR',
        },
        {
          name: 'RETURN',
          value:
            'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/nordea/success?signature=750dabe3ece0c320b194a8fc5a2cee609ce06eaabd2612b651e0213c8a9f0a3c&checkout-transaction-id=97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6&checkout-account=695861&checkout-method=GET&checkout-algorithm=sha256&checkout-timestamp=2025-05-17T18%3A50%3A33.869Z&checkout-nonce=062cbe48-5cff-4924-8a0a-6807f6d8e8c9',
        },
        {
          name: 'CANCEL',
          value:
            'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/nordea/cancel?signature=061b04683db63268e7893e5adc55cea488c6cb7c27e4fa0d08b0d748bd940748&checkout-transaction-id=97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6&checkout-account=695861&checkout-method=GET&checkout-algorithm=sha256&checkout-timestamp=2025-05-17T18%3A50%3A33.869Z&checkout-nonce=996179b1-5e6e-4782-9855-1579c36ab4ac',
        },
        {
          name: 'REJECT',
          value:
            'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/nordea/cancel?signature=45cb5e36e5d149795f5647d07ff234c7ebca0eb15e9d935f6acc8e81ab7eaa32&checkout-transaction-id=97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6&checkout-account=695861&checkout-method=GET&checkout-algorithm=sha256&checkout-timestamp=2025-05-17T18%3A50%3A33.869Z&checkout-nonce=cda243ea-a7f6-4020-9d4f-eee21aaeb336',
        },
        {
          name: 'ULT_BEN_ACCOUNT',
          value: 'FI6250000120313449',
        },
        {
          name: 'ULT_BEN_ACCOUNT_BIC',
          value: 'OKOYFIHH',
        },
        {
          name: 'ULT_BEN_NAME',
          value: 'Shop-in-Shop test shop',
        },
        {
          name: 'ULT_BEN_BID',
          value: 'FI21966066',
        },
        {
          name: 'ULT_BEN_IND_CODE',
          value: '66190',
        },
        {
          name: 'MAC',
          value:
            'EDC9204B14CF48AEF6E90F4E76AF167608636F97BDA5F4ECB6B88BB4AD3233DC2C1BBCE8F14C7273E5C7791822DAC1922691A500D797E984E460FC094BE7FDD0',
        },
      ],
    },
    {
      url: 'https://verkkopankki.danskebank.fi/SP/vemaha/VemahaApp',
      icon: 'https://resources.paytrail.com/images/payment-method-logos/danske.png',
      svg: 'https://resources.paytrail.com/images/payment-method-logos/danske.svg',
      name: 'Danske Bank',
      group: 'bank',
      id: 'danske',
      parameters: [
        {
          name: 'VERSIO',
          value: '4',
        },
        {
          name: 'ALG',
          value: '03',
        },
        {
          name: 'KNRO',
          value: '000000000000',
        },
        {
          name: 'SUMMA',
          value: '50.00',
        },
        {
          name: 'VIITE',
          value: '8230247567',
        },
        {
          name: 'VALUUTTA',
          value: 'EUR',
        },
        {
          name: 'ERAPAIVA',
          value: '17.05.2025',
        },
        {
          name: 'OKURL',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/danske/success',
        },
        {
          name: 'VIRHEURL',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/danske/cancel',
        },
        {
          name: 'lng',
          value: '1',
        },
        {
          name: 'TARKISTE',
          value: '99F646AD93F70BB85F65AB1448ADC6B1B5812F4A932E349E8E45D5443A7C4B89',
        },
      ],
    },
    {
      name: 'S-pankki',
      url: 'https://online.s-pankki.fi/service/paybutton',
      icon: 'https://resources.paytrail.com/images/payment-method-logos/spankki.png',
      svg: 'https://resources.paytrail.com/images/payment-method-logos/spankki.svg',
      id: 'spankki',
      group: 'bank',
      parameters: [
        {
          name: 'AAB_VERSION',
          value: '0002',
        },
        {
          name: 'AAB_DATE',
          value: 'EXPRESS',
        },
        {
          name: 'AAB_CONFIRM',
          value: 'YES',
        },
        {
          name: 'AAB_ALG',
          value: '03',
        },
        {
          name: 'AAB_RCV_NAME',
          value: 'Paytrail Oyj',
        },
        {
          name: 'AAB_STAMP',
          value: '822700317',
        },
        {
          name: 'AAB_RCV_ID',
          value: 'SPANKKIESHOPID',
        },
        {
          name: 'AAB_RCV_ACCOUNT',
          value: 'FI4139390001002369',
        },
        {
          name: 'AAB_KEYVERS',
          value: '0001',
        },
        {
          name: 'AAB_LANGUAGE',
          value: '1',
        },
        {
          name: 'AAB_AMOUNT',
          value: '50,00',
        },
        {
          name: 'AAB_REF',
          value: '8230247567',
        },
        {
          name: 'AAB_MSG',
          value: 'Shop-in-Shop test shop / lktHDjLcPw:n2Nf8bwpYR',
        },
        {
          name: 'AAB_RETURN',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/spankki/success',
        },
        {
          name: 'AAB_CANCEL',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/spankki/cancel',
        },
        {
          name: 'AAB_REJECT',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/spankki/cancel',
        },
        {
          name: 'AAB_CUR',
          value: 'EUR',
        },
        {
          name: 'AAB_MAC',
          value: '7107FC224A762A451AAB8C0E259AE7D7DC426285B7040CE033F9B976193DA302',
        },
      ],
    },
    {
      name: 'POP Pankki',
      url: 'https://verkkomaksu.poppankki.fi/vm/login.html',
      icon: 'https://resources.paytrail.com/images/payment-method-logos/pop.png',
      svg: 'https://resources.paytrail.com/images/payment-method-logos/pop.svg',
      id: 'pop',
      group: 'bank',
      parameters: [
        {
          name: 'NET_VERSION',
          value: '003',
        },
        {
          name: 'NET_DATE',
          value: 'EXPRESS',
        },
        {
          name: 'NET_CONFIRM',
          value: 'YES',
        },
        {
          name: 'NET_ALG',
          value: '03',
        },
        {
          name: 'NET_SELLER_ID',
          value: '0000000000',
        },
        {
          name: 'NET_STAMP',
          value: '822700317',
        },
        {
          name: 'NET_AMOUNT',
          value: '50,00',
        },
        {
          name: 'NET_CUR',
          value: 'EUR',
        },
        {
          name: 'NET_REF',
          value: '8230247567',
        },
        {
          name: 'NET_MSG',
          value: 'Shop-in-Shop test shop / lktHDjLcPw:n2Nf8bwpYR',
        },
        {
          name: 'NET_RETURN',
          value:
            'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/pop/success?signature=0dc1330cdd823f2af917c244d27af00fe9f8817245b591c7493a50b4e7aa6f7f&checkout-transaction-id=97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6&checkout-account=695861&checkout-method=GET&checkout-algorithm=sha256&checkout-timestamp=2025-05-17T18%3A50%3A33.870Z&checkout-nonce=8649d258-bfde-4420-9a90-60b3cf2ae4fd',
        },
        {
          name: 'NET_CANCEL',
          value:
            'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/pop/cancel?signature=d9327a466abb6e5b1b93293a55eef4534faebcda8f224cd8f42a7cb7a818b1e0&checkout-transaction-id=97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6&checkout-account=695861&checkout-method=GET&checkout-algorithm=sha256&checkout-timestamp=2025-05-17T18%3A50%3A33.870Z&checkout-nonce=0d964189-9342-4c47-8373-0a891b2e3f3d',
        },
        {
          name: 'NET_REJECT',
          value:
            'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/pop/cancel?signature=a28c97478439c18d68fb7af9e71063cf4ca20c1c6c407456cde53bba9484ef74&checkout-transaction-id=97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6&checkout-account=695861&checkout-method=GET&checkout-algorithm=sha256&checkout-timestamp=2025-05-17T18%3A50%3A33.870Z&checkout-nonce=dc4c4486-e14d-4cbc-a301-1f804187078f',
        },
        {
          name: 'NET_MAC',
          value: '322A5CF2B2871E30A934AE73C913E3DA2DD7993341C413433ACBCCA5072B34B6',
        },
      ],
    },
    {
      name: 'Oma Säästöpankki',
      url: 'https://verkkomaksu.omasp.fi/vm/login.html',
      icon: 'https://resources.paytrail.com/images/payment-method-logos/omasp.png',
      svg: 'https://resources.paytrail.com/images/payment-method-logos/omasp.svg',
      id: 'omasp',
      group: 'bank',
      parameters: [
        {
          name: 'NET_VERSION',
          value: '003',
        },
        {
          name: 'NET_DATE',
          value: 'EXPRESS',
        },
        {
          name: 'NET_CONFIRM',
          value: 'YES',
        },
        {
          name: 'NET_ALG',
          value: '03',
        },
        {
          name: 'NET_SELLER_ID',
          value: '0000000000',
        },
        {
          name: 'NET_STAMP',
          value: '822700317',
        },
        {
          name: 'NET_AMOUNT',
          value: '50,00',
        },
        {
          name: 'NET_CUR',
          value: 'EUR',
        },
        {
          name: 'NET_REF',
          value: '8230247567',
        },
        {
          name: 'NET_MSG',
          value: 'Shop-in-Shop test shop / lktHDjLcPw:n2Nf8bwpYR',
        },
        {
          name: 'NET_RETURN',
          value:
            'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/omasp/success?signature=e8197f59babe295ac84798b6aa79ced6ea295b111a710d7c64919cc31a122a86&checkout-transaction-id=97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6&checkout-account=695861&checkout-method=GET&checkout-algorithm=sha256&checkout-timestamp=2025-05-17T18%3A50%3A33.870Z&checkout-nonce=00ea3eed-22f6-4f50-9d05-89f2b4d72746',
        },
        {
          name: 'NET_CANCEL',
          value:
            'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/omasp/cancel?signature=9046701a28b8aa57318acfaa8812a768afda6000e64a88c29797299437659163&checkout-transaction-id=97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6&checkout-account=695861&checkout-method=GET&checkout-algorithm=sha256&checkout-timestamp=2025-05-17T18%3A50%3A33.870Z&checkout-nonce=75400ac0-cfd6-4cd0-93a3-7da43c4d05ff',
        },
        {
          name: 'NET_REJECT',
          value:
            'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/omasp/cancel?signature=1ce8a3131ed128523902ceff1f9bc9e7789fe6c2998c8654e26fdfecfcc8e211&checkout-transaction-id=97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6&checkout-account=695861&checkout-method=GET&checkout-algorithm=sha256&checkout-timestamp=2025-05-17T18%3A50%3A33.870Z&checkout-nonce=1d3696b1-6e45-472a-953f-092925f4fcca',
        },
        {
          name: 'NET_MAC',
          value: '10406BB9013C01BB893A267AD3D78FE86165E944FE18C010992CE7157F5B48A1',
        },
      ],
    },
    {
      name: 'Aktia',
      url: 'https://auth.aktia.fi/vmtest',
      icon: 'https://resources.paytrail.com/images/payment-method-logos/aktia.png',
      svg: 'https://resources.paytrail.com/images/payment-method-logos/aktia.svg',
      id: 'aktia',
      group: 'bank',
      parameters: [
        {
          name: 'NET_VERSION',
          value: '010',
        },
        {
          name: 'NET_DATE',
          value: 'EXPRESS',
        },
        {
          name: 'NET_CONFIRM',
          value: 'YES',
        },
        {
          name: 'NET_ALG',
          value: '03',
        },
        {
          name: 'NET_SELLER_ID',
          value: '1111111111111',
        },
        {
          name: 'NET_STAMP',
          value: '822700317',
        },
        {
          name: 'NET_AMOUNT',
          value: '50,00',
        },
        {
          name: 'NET_CUR',
          value: 'EUR',
        },
        {
          name: 'NET_REF',
          value: '8230247567',
        },
        {
          name: 'NET_MSG',
          value: 'Shop-in-Shop test shop / lktHDjLcPw:n2Nf8bwpYR',
        },
        {
          name: 'NET_RETURN',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/aktia/success',
        },
        {
          name: 'NET_CANCEL',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/aktia/cancel',
        },
        {
          name: 'NET_REJECT',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/aktia/cancel',
        },
        {
          name: 'NET_KEYVERS',
          value: '0001',
        },
        {
          name: 'NET_MAC',
          value: '64843F5E435FC6E08C2254A3C7B7BE6895737F1EDB323C02668C344A84149725',
        },
      ],
    },
    {
      name: 'Säästöpankki',
      url: 'https://verkkomaksu.saastopankki.fi/vm/login.html',
      icon: 'https://resources.paytrail.com/images/payment-method-logos/saastopankki.png',
      svg: 'https://resources.paytrail.com/images/payment-method-logos/saastopankki.svg',
      id: 'saastopankki',
      group: 'bank',
      parameters: [
        {
          name: 'NET_VERSION',
          value: '003',
        },
        {
          name: 'NET_DATE',
          value: 'EXPRESS',
        },
        {
          name: 'NET_CONFIRM',
          value: 'YES',
        },
        {
          name: 'NET_ALG',
          value: '03',
        },
        {
          name: 'NET_SELLER_ID',
          value: '0000000000',
        },
        {
          name: 'NET_STAMP',
          value: '822700317',
        },
        {
          name: 'NET_AMOUNT',
          value: '50,00',
        },
        {
          name: 'NET_CUR',
          value: 'EUR',
        },
        {
          name: 'NET_REF',
          value: '8230247567',
        },
        {
          name: 'NET_MSG',
          value: 'Shop-in-Shop test shop / lktHDjLcPw:n2Nf8bwpYR',
        },
        {
          name: 'NET_RETURN',
          value:
            'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/saastopankki/success?signature=65d4feacc10f2f002c15acef1cc8ccf94d0eadf020ee447f9b1f853173df1e7a&checkout-transaction-id=97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6&checkout-account=695861&checkout-method=GET&checkout-algorithm=sha256&checkout-timestamp=2025-05-17T18%3A50%3A33.870Z&checkout-nonce=0114d1c9-0106-4e46-a102-5cede50cbb98',
        },
        {
          name: 'NET_CANCEL',
          value:
            'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/saastopankki/cancel?signature=e45c7ca1439cdcf351a44e545d8d5fad1ffc3a5996f8a1468c51849d131b5298&checkout-transaction-id=97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6&checkout-account=695861&checkout-method=GET&checkout-algorithm=sha256&checkout-timestamp=2025-05-17T18%3A50%3A33.871Z&checkout-nonce=0402a1e9-cd76-481b-b5c4-08af1d1dc15a',
        },
        {
          name: 'NET_REJECT',
          value:
            'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/saastopankki/cancel?signature=54fd7ea058ad84eebb6e5bca6f53709f3f2938fe384fdee097d68fb1265c8e3e&checkout-transaction-id=97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6&checkout-account=695861&checkout-method=GET&checkout-algorithm=sha256&checkout-timestamp=2025-05-17T18%3A50%3A33.871Z&checkout-nonce=675e9c90-b3b7-4552-aaa1-9f1906c9919e',
        },
        {
          name: 'NET_MAC',
          value: '17AA6B891E6CC22A7A3F55D3AFFBFF5E0640FFA4FD15D4AA01FB83A52E835C1D',
        },
      ],
    },
    {
      name: 'Ålandsbanken',
      url: 'https://online.alandsbanken.fi/service/paybutton',
      icon: 'https://resources.paytrail.com/images/payment-method-logos/alandsbanken.png',
      svg: 'https://resources.paytrail.com/images/payment-method-logos/alandsbanken.svg',
      id: 'alandsbanken',
      group: 'bank',
      parameters: [
        {
          name: 'AAB_VERSION',
          value: '0002',
        },
        {
          name: 'AAB_DATE',
          value: 'EXPRESS',
        },
        {
          name: 'AAB_CONFIRM',
          value: 'YES',
        },
        {
          name: 'AAB_ALG',
          value: '03',
        },
        {
          name: 'AAB_RCV_NAME',
          value: 'Paytrail Oyj',
        },
        {
          name: 'AAB_STAMP',
          value: '822700317',
        },
        {
          name: 'AAB_RCV_ID',
          value: 'AABESHOPID',
        },
        {
          name: 'AAB_RCV_ACCOUNT',
          value: 'FI7766010001130855',
        },
        {
          name: 'AAB_KEYVERS',
          value: '0001',
        },
        {
          name: 'AAB_LANGUAGE',
          value: '1',
        },
        {
          name: 'AAB_AMOUNT',
          value: '50,00',
        },
        {
          name: 'AAB_REF',
          value: '8230247567',
        },
        {
          name: 'AAB_MSG',
          value: 'Shop-in-Shop test shop / lktHDjLcPw:n2Nf8bwpYR',
        },
        {
          name: 'AAB_RETURN',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/alandsbanken/success',
        },
        {
          name: 'AAB_CANCEL',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/alandsbanken/cancel',
        },
        {
          name: 'AAB_REJECT',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/alandsbanken/cancel',
        },
        {
          name: 'AAB_CUR',
          value: 'EUR',
        },
        {
          name: 'AAB_MAC',
          value: '910190718A05720538BF4E52E2F057226DCEC27AB68A556280C6522CDD9B5BD5',
        },
      ],
    },
    {
      name: 'Apple Pay',
      id: 'apple-pay',
      group: 'mobile',
      url: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/apple-pay/loading-and-redirect',
      icon: 'https://resources.paytrail.com/images/payment-method-logos/apple-pay.png',
      svg: 'https://resources.paytrail.com/images/payment-method-logos/apple-pay.svg',
      parameters: [
        {
          name: 'checkout-transaction-id',
          value: '97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6',
        },
        {
          name: 'checkout-account',
          value: '695861',
        },
        {
          name: 'checkout-method',
          value: 'POST',
        },
        {
          name: 'checkout-algorithm',
          value: 'sha256',
        },
        {
          name: 'checkout-timestamp',
          value: '2025-05-17T18:50:33.871Z',
        },
        {
          name: 'checkout-nonce',
          value: '6f35fcb9-caaf-4cbc-8058-2632dbb536ca',
        },
        {
          name: 'signature',
          value: 'dee1fc0627fb30b97b63815ab5ef68b4142ea29f54321b88e80df13ed590728b',
        },
      ],
    },
    {
      url: 'https://v1-hub-staging.sph-test-solinor.com/form/view/pay_with_card',
      icon: 'https://resources.paytrail.com/images/payment-method-logos/visa.png',
      svg: 'https://resources.paytrail.com/images/payment-method-logos/visa.svg',
      name: 'Visa',
      group: 'creditcard',
      id: 'creditcard',
      parameters: [
        {
          name: 'sph-account',
          value: 'checkout',
        },
        {
          name: 'sph-merchant',
          value: 'checkout',
        },
        {
          name: 'sph-api-version',
          value: '20220825',
        },
        {
          name: 'sph-timestamp',
          value: '2025-05-17T18:50:33Z',
        },
        {
          name: 'sph-request-id',
          value: '86bee777-2be1-4b0b-a8b4-607bde412267',
        },
        {
          name: 'sph-amount',
          value: '5000',
        },
        {
          name: 'sph-currency',
          value: 'EUR',
        },
        {
          name: 'sph-order',
          value: '8230247567',
        },
        {
          name: 'language',
          value: 'FI',
        },
        {
          name: 'description',
          value: 'Shop-in-Shop test shop / lktHDjLcPw:n2Nf8bwpYR',
        },
        {
          name: 'sph-success-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/creditcard/success',
        },
        {
          name: 'sph-cancel-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/creditcard/cancel',
        },
        {
          name: 'sph-failure-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/creditcard/cancel',
        },
        {
          name: 'sph-webhook-success-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/creditcard/success',
        },
        {
          name: 'sph-webhook-cancel-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/creditcard/cancel',
        },
        {
          name: 'sph-webhook-failure-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/creditcard/cancel',
        },
        {
          name: 'sph-webhook-delay',
          value: '60',
        },
        {
          name: 'sph-sub-merchant-vat-id',
          value: 'FI21966066',
        },
        {
          name: 'sph-sub-merchant-id',
          value: '695861',
        },
        {
          name: 'sph-sub-merchant-name',
          value: 'Shop-in-Shop test sho',
        },
        {
          name: 'sph-sub-merchant-street-address',
          value: 'Eteläpuisto 2',
        },
        {
          name: 'sph-sub-merchant-city',
          value: 'Tampere',
        },
        {
          name: 'sph-sub-merchant-postal-code',
          value: '33200',
        },
        {
          name: 'sph-sub-merchant-telephone',
          value: '0800 552 010',
        },
        {
          name: 'sph-sub-merchant-country-code',
          value: 'FI',
        },
        {
          name: 'sph-sub-merchant-merchant-category-code',
          value: '4814',
        },
        {
          name: 'signature',
          value: 'SPH1 checkout_1 38c78c49575904c37920572d28061b65bd4ad2c8edc670c334ddd3483c4261ef',
        },
      ],
    },
    {
      url: 'https://v1-hub-staging.sph-test-solinor.com/form/view/pay_with_card',
      icon: 'https://resources.paytrail.com/images/payment-method-logos/mastercard.png',
      svg: 'https://resources.paytrail.com/images/payment-method-logos/mastercard.svg',
      name: 'Mastercard',
      group: 'creditcard',
      id: 'creditcard',
      parameters: [
        {
          name: 'sph-account',
          value: 'checkout',
        },
        {
          name: 'sph-merchant',
          value: 'checkout',
        },
        {
          name: 'sph-api-version',
          value: '20220825',
        },
        {
          name: 'sph-timestamp',
          value: '2025-05-17T18:50:33Z',
        },
        {
          name: 'sph-request-id',
          value: '3737d22d-8751-473f-8743-028a1113535c',
        },
        {
          name: 'sph-amount',
          value: '5000',
        },
        {
          name: 'sph-currency',
          value: 'EUR',
        },
        {
          name: 'sph-order',
          value: '8230247567',
        },
        {
          name: 'language',
          value: 'FI',
        },
        {
          name: 'description',
          value: 'Shop-in-Shop test shop / lktHDjLcPw:n2Nf8bwpYR',
        },
        {
          name: 'sph-success-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/creditcard/success',
        },
        {
          name: 'sph-cancel-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/creditcard/cancel',
        },
        {
          name: 'sph-failure-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/creditcard/cancel',
        },
        {
          name: 'sph-webhook-success-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/creditcard/success',
        },
        {
          name: 'sph-webhook-cancel-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/creditcard/cancel',
        },
        {
          name: 'sph-webhook-failure-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/creditcard/cancel',
        },
        {
          name: 'sph-webhook-delay',
          value: '60',
        },
        {
          name: 'sph-sub-merchant-vat-id',
          value: 'FI21966066',
        },
        {
          name: 'sph-sub-merchant-id',
          value: '695861',
        },
        {
          name: 'sph-sub-merchant-name',
          value: 'Shop-in-Shop test sho',
        },
        {
          name: 'sph-sub-merchant-street-address',
          value: 'Eteläpuisto 2',
        },
        {
          name: 'sph-sub-merchant-city',
          value: 'Tampere',
        },
        {
          name: 'sph-sub-merchant-postal-code',
          value: '33200',
        },
        {
          name: 'sph-sub-merchant-telephone',
          value: '0800 552 010',
        },
        {
          name: 'sph-sub-merchant-country-code',
          value: 'FI',
        },
        {
          name: 'sph-sub-merchant-merchant-category-code',
          value: '4814',
        },
        {
          name: 'signature',
          value: 'SPH1 checkout_1 f0b29385aa16928a46139bf1c15b9e53cf86701be1d2a3730511e7d04e791764',
        },
      ],
    },
    {
      url: 'https://v1-hub-staging.sph-test-solinor.com/form/view/pay_with_card',
      icon: 'https://resources.paytrail.com/images/payment-method-logos/amex.png',
      svg: 'https://resources.paytrail.com/images/payment-method-logos/amex.svg',
      name: 'American Express',
      group: 'creditcard',
      id: 'amex',
      parameters: [
        {
          name: 'sph-account',
          value: 'checkout',
        },
        {
          name: 'sph-merchant',
          value: 'checkout',
        },
        {
          name: 'sph-api-version',
          value: '20220825',
        },
        {
          name: 'sph-timestamp',
          value: '2025-05-17T18:50:33Z',
        },
        {
          name: 'sph-request-id',
          value: '0bdb0cbb-f148-45ad-910d-de4e8d23d010',
        },
        {
          name: 'sph-amount',
          value: '5000',
        },
        {
          name: 'sph-currency',
          value: 'EUR',
        },
        {
          name: 'sph-order',
          value: '8230247567',
        },
        {
          name: 'language',
          value: 'FI',
        },
        {
          name: 'description',
          value: 'Shop-in-Shop test shop / lktHDjLcPw:n2Nf8bwpYR',
        },
        {
          name: 'sph-success-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/amex/success',
        },
        {
          name: 'sph-cancel-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/amex/cancel',
        },
        {
          name: 'sph-failure-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/amex/cancel',
        },
        {
          name: 'sph-webhook-success-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/amex/success',
        },
        {
          name: 'sph-webhook-cancel-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/amex/cancel',
        },
        {
          name: 'sph-webhook-failure-url',
          value: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/amex/cancel',
        },
        {
          name: 'sph-webhook-delay',
          value: '60',
        },
        {
          name: 'sph-sub-merchant-vat-id',
          value: 'FI21966066',
        },
        {
          name: 'sph-sub-merchant-id',
          value: '695861',
        },
        {
          name: 'sph-sub-merchant-name',
          value: 'Shop-in-Shop test sho',
        },
        {
          name: 'sph-sub-merchant-street-address',
          value: 'Eteläpuisto 2',
        },
        {
          name: 'sph-sub-merchant-city',
          value: 'Tampere',
        },
        {
          name: 'sph-sub-merchant-postal-code',
          value: '33200',
        },
        {
          name: 'sph-sub-merchant-telephone',
          value: '0800 552 010',
        },
        {
          name: 'sph-sub-merchant-country-code',
          value: 'FI',
        },
        {
          name: 'sph-sub-merchant-merchant-category-code',
          value: '4814',
        },
        {
          name: 'signature',
          value: 'SPH1 checkout_1 34b2b57bbf6541a92bcdee6cb3d96da55ce3dee7c71531248b40501779986a63',
        },
      ],
    },
    {
      name: 'Walley',
      url: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/walleyb2c/loading-and-redirect',
      icon: 'https://resources.paytrail.com/images/payment-method-logos/walley.png',
      svg: 'https://resources.paytrail.com/images/payment-method-logos/walley.svg',
      parameters: [
        {
          name: 'checkout-transaction-id',
          value: '97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6',
        },
        {
          name: 'checkout-account',
          value: '695861',
        },
        {
          name: 'checkout-method',
          value: 'POST',
        },
        {
          name: 'checkout-algorithm',
          value: 'sha256',
        },
        {
          name: 'checkout-timestamp',
          value: '2025-05-17T18:50:33.872Z',
        },
        {
          name: 'checkout-nonce',
          value: 'ee49bd49-02fd-4e80-bd03-0536bd741c73',
        },
        {
          name: 'signature',
          value: '48928671dfa88a93e2469223b0517f6494d5227377d5246239c3ac64d556e2a1',
        },
      ],
      id: 'walleyb2c',
      group: 'credit',
    },
    {
      name: 'Walley',
      url: 'https://services.paytrail.com/payments/97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6/walleyb2b/loading-and-redirect',
      icon: 'https://resources.paytrail.com/images/payment-method-logos/walley-yrityslasku.png',
      svg: 'https://resources.paytrail.com/images/payment-method-logos/walley-yrityslasku.svg',
      parameters: [
        {
          name: 'checkout-transaction-id',
          value: '97bbaa8c-d9b4-40c7-bd05-beda78d8cbb6',
        },
        {
          name: 'checkout-account',
          value: '695861',
        },
        {
          name: 'checkout-method',
          value: 'POST',
        },
        {
          name: 'checkout-algorithm',
          value: 'sha256',
        },
        {
          name: 'checkout-timestamp',
          value: '2025-05-17T18:50:33.872Z',
        },
        {
          name: 'checkout-nonce',
          value: '2ef70db7-7d85-488e-8af4-c037686e00a5',
        },
        {
          name: 'signature',
          value: '7bed498756e8728f38a455486241a7c9db1d69e0bf0c250cdc6da56d264ddd20',
        },
      ],
      id: 'walleyb2b',
      group: 'credit',
    },
  ],
}

export default payments
