package expo.modules.smsqueue

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsQueueModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SmsQueue")

    AsyncFunction("drain") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      SmsInbox.drain(context).map { payload ->
        mapOf(
          "sender" to payload.sender,
          "body" to payload.body,
          "receivedAt" to payload.receivedAt
        )
      }
    }

    AsyncFunction("scanInbox") { sinceReceivedAt: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      SmsInbox.scanInbox(context, sinceReceivedAt).map { payload ->
        mapOf(
          "sender" to payload.sender,
          "body" to payload.body,
          "receivedAt" to payload.receivedAt
        )
      }
    }

    AsyncFunction("setAllowedSenders") { senders: List<String> ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      SmsInbox.setAllowedSenders(context, senders)
    }
  }
}
