import SES, { SendTemplatedEmailRequest } from 'aws-sdk/clients/ses';


const ses = new SES();

export async function sendTemplatedMail(template: string, to: string[], data: Record<string, string>) {
  const params: SendTemplatedEmailRequest = {
    Destination: {
      ToAddresses: to,
    },
    Template: template,
    TemplateData: JSON.stringify(data),
    Source: "koekalenteri@koekalenteri.snj.fi",
  };

  try {
    return ses.sendTemplatedEmail(params).promise();
  } catch (e) {
    console.log('Failed to send email', e)
  }
}
