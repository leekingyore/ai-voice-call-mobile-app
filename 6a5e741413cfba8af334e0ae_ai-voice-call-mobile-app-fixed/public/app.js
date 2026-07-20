const form = document.querySelector("#callForm");
const apiKeyInput = document.querySelector("#apiKey");
const modelInput = document.querySelector("#model");
const voiceInput = document.querySelector("#voice");
const instructionsInput = document.querySelector("#instructions");
const startBtn = document.querySelector("#startBtn");
const muteBtn = document.querySelector("#muteBtn");
const hangupBtn = document.querySelector("#hangupBtn");
const clearBtn = document.querySelector("#clearBtn");
const transcript = document.querySelector("#transcript");
const remoteAudio = document.querySelector("#remoteAudio");
const statusDot = document.querySelector("#statusDot");
const statusTitle = document.querySelector("#statusTitle");
const statusText = document.querySelector("#statusText");

let peerConnection = null;
let dataChannel = null;
let localStream = null;
let currentResponseEl = null;
let isMuted = false;

function setStatus(state, title, text) {
  statusDot.className = `status-dot ${state || ""}`.trim();
  statusTitle.textContent = title;
  statusText.textContent = text;
}

function setControls(connected, connecting = false) {
  startBtn.disabled = connected || connecting;
  muteBtn.disabled = !connected;
  hangupBtn.disabled = !connected && !connecting;
  apiKeyInput.disabled = connected || connecting;
  modelInput.disabled = connected || connecting;
  voiceInput.disabled = connected || connecting;
  instructionsInput.disabled = connected || connecting;
  startBtn.textContent = connecting ? "连接中..." : "开始通话";
}

function clearPlaceholder() {
  const placeholder = transcript.querySelector(".placeholder");
  if (placeholder) placeholder.remove();
}

function appendEvent(title, body = "") {
  clearPlaceholder();
  const el = document.createElement("div");
  el.className = "event";
  el.innerHTML = `<strong>${title}</strong>${body}`;
  transcript.append(el);
  transcript.scrollTop = transcript.scrollHeight;
  return el;
}

function createAssistantMessage() {
  clearPlaceholder();
  const el = document.createElement("div");
  el.className = "message";
  el.innerHTML = "<strong>AI</strong><span></span>";
  transcript.append(el);
  transcript.scrollTop = transcript.scrollHeight;
  return el;
}

function appendAssistantText(delta) {
  if (!currentResponseEl) currentResponseEl = createAssistantMessage();
  const span = currentResponseEl.querySelector("span");
  span.textContent += delta;
  transcript.scrollTop = transcript.scrollHeight;
}

async function requestSession({ apiKey, model, voice, instructions }) {
  const response = await fetch("/api/realtime/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ apiKey, model, voice, instructions })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "创建会话失败。");
  }

  const ephemeralKey = data?.client_secret?.value;
  if (!ephemeralKey) {
    throw new Error("响应中没有临时密钥，请检查模型是否支持实时语音。");
  }

  return ephemeralKey;
}

function handleRealtimeEvent(event) {
  if (!event?.type) return;

  if (
    event.type === "response.audio_transcript.delta" ||
    event.type === "response.text.delta"
  ) {
    appendAssistantText(event.delta || "");
    return;
  }

  if (event.type === "response.done") {
    currentResponseEl = null;
    return;
  }

  if (event.type === "input_audio_buffer.speech_started") {
    appendEvent("检测到你正在说话");
    return;
  }

  if (event.type === "input_audio_buffer.speech_stopped") {
    appendEvent("正在等待 AI 回复");
    return;
  }

  if (event.type === "error") {
    appendEvent("AI 返回错误", event.error?.message || "未知错误");
  }
}

async function startCall(event) {
  event.preventDefault();

  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("error", "浏览器不支持", "当前浏览器不支持麦克风访问。");
    return;
  }

  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim();
  const voice = voiceInput.value;
  const instructions = instructionsInput.value.trim();

  if (!apiKey) {
    setStatus("error", "缺少 API Key", "请先填写 API Key。");
    return;
  }

  try {
    setControls(false, true);
    setStatus("connecting", "正在连接", "正在创建临时会话并请求麦克风权限。");
    appendEvent("开始连接", `模型：${model}，语音：${voice}`);

    const ephemeralKey = await requestSession({ apiKey, model, voice, instructions });
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    peerConnection = new RTCPeerConnection();
    dataChannel = peerConnection.createDataChannel("oai-events");

    peerConnection.ontrack = (trackEvent) => {
      remoteAudio.srcObject = trackEvent.streams[0];
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      if (state === "connected") {
        setStatus("connected", "通话中", "你可以直接开口和 AI 对话。");
        setControls(true);
      }
      if (["failed", "disconnected", "closed"].includes(state)) {
        if (state !== "closed") {
          setStatus("error", "连接中断", "通话连接已断开，请重新开始。");
        }
        cleanup();
      }
    };

    dataChannel.onopen = () => {
      appendEvent("数据通道已连接", "现在可以进行实时语音对话。");
    };

    dataChannel.onmessage = (messageEvent) => {
      try {
        handleRealtimeEvent(JSON.parse(messageEvent.data));
      } catch {
        appendEvent("收到非 JSON 事件", messageEvent.data);
      }
    };

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const realtimeResponse = await fetch(
      `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp"
        },
        body: offer.sdp
      }
    );

    if (!realtimeResponse.ok) {
      const errorText = await realtimeResponse.text();
      throw new Error(errorText || "建立实时音频连接失败。");
    }

    const answerSdp = await realtimeResponse.text();
    await peerConnection.setRemoteDescription({
      type: "answer",
      sdp: answerSdp
    });

    setStatus("connecting", "即将接通", "WebRTC 握手已完成，正在等待通话就绪。");
  } catch (error) {
    cleanup();
    setControls(false);
    setStatus("error", "连接失败", error instanceof Error ? error.message : "未知错误");
    appendEvent("连接失败", error instanceof Error ? error.message : "未知错误");
  }
}

function cleanup() {
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }

  if (peerConnection) {
    peerConnection.getSenders().forEach((sender) => {
      if (sender.track) sender.track.stop();
    });
    peerConnection.close();
    peerConnection = null;
  }

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }

  remoteAudio.srcObject = null;
  currentResponseEl = null;
  isMuted = false;
  muteBtn.textContent = "静音";
  setControls(false);
}

function hangup() {
  cleanup();
  setStatus("", "未连接", "通话已结束，可重新开始。");
  appendEvent("通话已结束");
}

function toggleMute() {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !isMuted;
  });
  muteBtn.textContent = isMuted ? "取消静音" : "静音";
  appendEvent(isMuted ? "麦克风已静音" : "麦克风已恢复");
}

form.addEventListener("submit", startCall);
hangupBtn.addEventListener("click", hangup);
muteBtn.addEventListener("click", toggleMute);
clearBtn.addEventListener("click", () => {
  transcript.innerHTML = '<p class="placeholder">通话开始后，AI 的文本片段和状态事件会显示在这里。</p>';
});
