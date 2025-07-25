import { ZMailService } from '../src';

test('My Greeter', () => {
  const mailer = new ZMailService({
    mailSender: 'info@ztechno.nl',
    auth: {
      user: 'ztechnologiesint@gmail.com',
      pass: '',
    },
    sqlService: null as any, // Mock or provide a real SQL service if needed
  });
  mailer.send({ recipient: 'ztechnologiesint@gmail.com', subject: 'Unit Test', body: 'Hello!' }).then(res => {
    expect(res).toBe('success');
  })
});
