import SES, { SendTemplatedEmailRequest } from 'aws-sdk/clients/ses';
import { Language } from 'koekalenteri-shared/model';


const ses = new SES();

export async function sendTemplatedMail(template: string, language: Language, from: string, to: string[], data: Record<string, string>) {
  const params: SendTemplatedEmailRequest = {
    Destination: {
      ToAddresses: to,
    },
    Template: `${template}-${language}`,
    TemplateData: JSON.stringify(data),
    Source: from,
  };

  try {
    return ses.sendTemplatedEmail(params).promise();
  } catch (e) {
    // TODO: queue for retry based on error
    console.log('Failed to send email', e);
  }
}
