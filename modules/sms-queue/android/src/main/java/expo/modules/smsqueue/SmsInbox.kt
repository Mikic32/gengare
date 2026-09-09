package expo.modules.smsqueue

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object SmsInbox {
  private const val PREFS_NAME = "gengare_sms_inbox"
  private const val QUEUE_KEY = "queued_sms"
  private const val ALLOWLIST_KEY = "allowed_senders"
  private val DEFAULT_ALLOWLIST = listOf("BANK")

  fun receive(context: Context, payload: QueuedSms): Boolean {
    if (!isAllowedSender(payload.sender, getAllowedSenders(context))) {
      return false
    }

    synchronized(this) {
      val queue = readQueue(context)
      queue.add(payload)
      writeQueue(context, queue)
    }

    return true
  }

  fun drain(context: Context): List<QueuedSms> {
    synchronized(this) {
      val queue = readQueue(context)
      writeQueue(context, emptyList())
      return queue
    }
  }

  fun setAllowedSenders(context: Context, senders: List<String>) {
    val normalized = senders.map { it.trim() }.filter { it.isNotEmpty() }
    synchronized(this) {
      prefs(context)
        .edit()
        .putString(ALLOWLIST_KEY, JSONArray(normalized).toString())
        .commit()
    }
  }

  fun getAllowedSenders(context: Context): List<String> {
    synchronized(this) {
      val raw = prefs(context).getString(ALLOWLIST_KEY, null) ?: return DEFAULT_ALLOWLIST
      val array = JSONArray(raw)
      return buildList {
        for (index in 0 until array.length()) {
          val sender = array.getString(index).trim()
          if (sender.isNotEmpty()) {
            add(sender)
          }
        }
      }
    }
  }

  fun isAllowedSender(sender: String, allowedSenders: List<String>): Boolean {
    val normalizedSender = sender.trim().uppercase()
    return allowedSenders.any { it.trim().uppercase() == normalizedSender }
  }

  private fun readQueue(context: Context): MutableList<QueuedSms> {
    val raw = prefs(context).getString(QUEUE_KEY, "[]") ?: "[]"
    val array = JSONArray(raw)
    return MutableList(array.length()) { index ->
      val item = array.getJSONObject(index)
      QueuedSms(
        sender = item.getString("sender"),
        body = item.getString("body"),
        receivedAt = item.getString("receivedAt")
      )
    }
  }

  private fun writeQueue(context: Context, queue: List<QueuedSms>) {
    val array = JSONArray()
    queue.forEach { payload ->
      array.put(
        JSONObject()
          .put("sender", payload.sender)
          .put("body", payload.body)
          .put("receivedAt", payload.receivedAt)
      )
    }

    prefs(context).edit().putString(QUEUE_KEY, array.toString()).commit()
  }

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}
