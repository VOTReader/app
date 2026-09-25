package com.votreader.sacredui

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * m3 (2026-09-24): the app's recordings play here, in ExoPlayer inside a Media3 MediaSessionService, instead of the
 * WebView's <audio>. Why: Android 17 mutes a background app's playback unless a media foreground service is live, and
 * the WebView path dropped that service at every chapter end and could not raise it again with the screen off
 * (digest A8, D:/AgentBackbone/reports/phone-audio-and-growth-2026-09-24/DIGEST.md). Media3 keeps the service in the
 * foreground for as long as the player plays, and the page hands over the next recording in advance (upcoming), so
 * ExoPlayer crosses the seam itself.
 *
 * The session draws the lock screen, notification, Bluetooth and car controls. Play, pause and seek act on ExoPlayer
 * directly (the page hears the edges through [NativeAudioController]); next and previous go to the page
 * ([commandSink]), which owns the queue: sections, compilations, songs, offline substitution.
 *
 * Audio focus, becoming-noisy (headphones out) and the wake + Wi-Fi locks are ExoPlayer's. A downloaded recording
 * (listening item 8) is read from its file; everything else streams over HTTPS (GitHub release assets redirect).
 */
@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {

    private var session: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val http = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(20_000)
        val offline = OfflineAudioStore.shared(this)
        val source = ResolvingDataSource.Factory(DefaultDataSource.Factory(this, http)) { spec ->
            offline.fileFor(spec.uri.toString())?.let { spec.withUri(Uri.fromFile(it)) } ?: spec
        }
        val player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(source))
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        session = MediaSession.Builder(this, PageOwnsTheQueue(player))
            .setCallback(Callback())
            .setSessionActivity(open)
            .build()
        setMediaNotificationProvider(
            DefaultMediaNotificationProvider.Builder(this).build().apply { setSmallIcon(android.R.drawable.ic_media_play) },
        )
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    /** Swiped away from recents: the page, which owns the queue, is gone with the task, so playback ends with it. */
    override fun onTaskRemoved(rootIntent: Intent?) {
        session?.player?.let { it.pause(); it.stop() }
        stopSelf()
    }

    override fun onDestroy() {
        session?.let { it.player.release(); it.release() }
        session = null
        super.onDestroy()
    }

    /** Next and previous belong to the page's queue; the system surfaces show both buttons. */
    private class PageOwnsTheQueue(player: Player) : ForwardingPlayer(player) {
        override fun getAvailableCommands(): Player.Commands = super.getAvailableCommands().buildUpon()
            .addAll(
                Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
            )
            .build()

        override fun isCommandAvailable(command: Int): Boolean = availableCommands.contains(command)

        /** What plays is the page's to choose: a jump to another item, a repeat or shuffle mode would change it
         *  without a seam the page hears (a car's queue tap, AVRCP repeat; refutation S3). The app never asks. */
        override fun seekTo(mediaItemIndex: Int, positionMs: Long) {
            if (mediaItemIndex == currentMediaItemIndex) super.seekTo(mediaItemIndex, positionMs)
        }
        override fun seekToDefaultPosition(mediaItemIndex: Int) {
            if (mediaItemIndex == currentMediaItemIndex) super.seekToDefaultPosition(mediaItemIndex)
        }
        override fun setRepeatMode(repeatMode: Int) = Unit
        override fun setShuffleModeEnabled(shuffleModeEnabled: Boolean) = Unit
        override fun seekToNext() = send("next")
        override fun seekToNextMediaItem() = send("next")
        override fun seekToPrevious() = send("prev")
        override fun seekToPreviousMediaItem() = send("prev")

        private fun send(cmd: String) { commandSink?.invoke(cmd, 0L) }
    }

    private inner class Callback : MediaSession.Callback {
        /**
         * Another app's controller (the system's media card, Bluetooth, a car, a watch) gets transport only: play,
         * pause, seek within the recording, next and previous. Changing the list, jumping to an item or setting
         * repeat and shuffle stay the page's (refutation S3).
         */
        override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
            if (controller.packageName == packageName) return MediaSession.ConnectionResult.AcceptedResultBuilder(session).build()
            val transport = MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS.buildUpon()
                .removeAll(
                    Player.COMMAND_CHANGE_MEDIA_ITEMS, Player.COMMAND_SET_MEDIA_ITEM, Player.COMMAND_SEEK_TO_MEDIA_ITEM,
                    Player.COMMAND_SET_REPEAT_MODE, Player.COMMAND_SET_SHUFFLE_MODE,
                )
                .build()
            return MediaSession.ConnectionResult.AcceptedResultBuilder(session).setAvailablePlayerCommands(transport).build()
        }

        /**
         * Media items cross the session boundary without their uri, so it travels in the request metadata and is put
         * back here. Only this app's own controller may set what plays; another app's request is refused.
         */
        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<MutableList<MediaItem>> {
            if (controller.packageName != packageName) {
                return Futures.immediateFailedFuture(SecurityException("only the app sets what plays"))
            }
            return Futures.immediateFuture(mediaItems.map { resolve(it) }.toMutableList())
        }
    }

    companion object {
        /** The page's transport receiver (MainActivity sets it; cleared in its onDestroy). Same shape as the keep-alive's. */
        @Volatile
        var commandSink: ((String, Long) -> Unit)? = null

        /** The item with its uri (and the mime a release asset needs) restored from the request metadata. */
        fun resolve(item: MediaItem): MediaItem {
            val url = item.requestMetadata.mediaUri?.toString() ?: item.mediaId.substringAfter('|')
            if (!NativeAudioLogic.playable(url)) return item.buildUpon().setUri(Uri.EMPTY).build()
            return item.buildUpon().setUri(url).setMimeType(NativeAudioLogic.mimeFor(url)).build()
        }
    }
}
