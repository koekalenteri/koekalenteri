import { SESClient, SendTemplatedEmailCommand  } from '@aws-sdk/client-ses';
import { Language } from 'koekalenteri-shared/model';

const sesClient = new SESClient({});

export async function sendTemplatedMail(template: string, language: Language, from: string, to: string[], data: Record<string, unknown>) {
  const params = {
    ConfigurationSetName: 'Koekalenteri',
    Destination: {
      ToAddresses: to,
    },
    Template: `${template}-${language}`,
    TemplateData: JSON.stringify(data),
    Source: from,
  };

  try {
    return sesClient.send(new SendTemplatedEmailCommand(params));
  } catch (e) {
    // TODO: queue for retry based on error
    console.log('Failed to send email', e);
  }
}
