package expo.modules.smsqueue

data class QueuedSms(
  val sender: String,
  val body: String,
  val receivedAt: String
)
