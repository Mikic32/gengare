package expo.modules.smsqueue

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

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
        receivedAt = formatReceivedAt(messages.first().timestampMillis)
      )
    )
  }

  private fun formatReceivedAt(timestampMillis: Long): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    formatter.timeZone = TimeZone.getTimeZone("UTC")
    return formatter.format(Date(timestampMillis))
  }
}
