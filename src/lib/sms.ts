export interface SmsDeliveryResult {
  success: boolean;
  message: string;
}

export async function sendSmsAlert(message: string): Promise<SmsDeliveryResult> {
  const provider = (process.env.SMS_PROVIDER || '').trim().toUpperCase();
  const apiKey = (process.env.SMS_API_KEY || '').trim();
  const senderId = (process.env.SMS_SENDER_ID || '').trim();
  const alertPhone = (process.env.SMS_ALERT_PHONE || '').trim();

  if (!provider || !apiKey || !alertPhone) {
    return {
      success: false,
      message: 'SMS skipped: Missing SMS_PROVIDER, SMS_API_KEY, or SMS_ALERT_PHONE in env.',
    };
  }

  const phones = alertPhone.split(',').map(p => p.trim()).filter(Boolean);

  try {
    if (provider === 'MSG91') {
      const payload = {
        sender: senderId || 'IOCL',
        route: '4',
        country: '91',
        sms: [{ message, to: phones }]
      };

      const res = await fetch(`https://api.msg91.com/api/v2/sendsms`, {
        method: 'POST',
        headers: {
          'authkey': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }

      return { success: true, message: 'SMS sent successfully via MSG91' };
    } 
    
    // Add additional providers (Twilio, etc) here as needed.
    
    return { success: false, message: `SMS skipped: Provider ${provider} not implemented.` };
  } catch (error: any) {
    console.error('[SMS] Delivery failed:', error);
    return {
      success: false,
      message: error?.message || 'Unknown SMS failure',
    };
  }
}
