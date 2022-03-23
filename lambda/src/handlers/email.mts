import { SESv2  } from '@aws-sdk/client-sesv2';
import { Language } from 'shared';


const ses = new SESv2({ region: 'eu-north-1' });

export async function sendTemplatedMail(template: string, language: Language, from: string, to: string[], data: Record<string, unknown>) {
  const params = {
    ConfigurationSetName: 'Koekalenteri',
    Destination: {
      ToAddresses: to,
    },
    Content: {
      Template: {
        Template: `${template}-${language}`,
        TemplateData: JSON.stringify(data),
      }
    },
    Source: from,
  };

  try {
    await ses.sendEmail(params);
  } catch (e) {
    // TODO: queue for retry based on error
    console.log('Failed to send email', e);
  }
}
