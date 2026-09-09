package expo.modules.smsqueue

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

class BankSmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
      return
    }

    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
    if (messages.isEmpty()) {
      return
    }

    val sender = messages.first().displayOriginatingAddress?.trim().orEmpty()
    val body = messages.joinToString(separator = "") { message ->
      message.displayMessageBody.orEmpty()
    }.trim()

    if (sender.isEmpty() || body.isEmpty()) {
      return
    }

    SmsInbox.receive(
      context,
      QueuedSms(
        sender = sender,
        body = body,
        receivedAt = SmsInbox.formatReceivedAt(messages.first().timestampMillis)
      )
    )
  }
}
