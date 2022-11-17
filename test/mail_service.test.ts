import { ZMailService } from '../src/mail_service';

test('My Greeter', () => {
  const mailer = ZMailService.get({
    mailSender: 'info@ztechno.nl',
    auth: {
      user: 'ztechnologiesint@gmail.com',
      pass: '',
    },
  });
  mailer.send({ recipient: 'ztechnologiesint@gmail.com', subject: 'Unit Test', body: 'Hello!' }).then(res => {
    expect(res).toBe('success');
  })
});
