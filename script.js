"use strict";

/*
 * ToolsFile 2.0
 * Client-side file validation + processing UI + download management.
 *
 * مسیر API در صورت فعال‌سازی پردازش سروری:
 * /api/upload
 *
 * معماری فعلی ابزارفایل کلاینت‌ساید است و OCR با Tesseract.js در مرورگر اجرا می‌شود.
 * :contentReference[oaicite:2]{index=2}
 */

(() => {
  const CONFIG = {
    maxFileSize: 20 * 1024 * 1024,

    allowedExtensions: new Set([
      "jpg",
      "jpeg",
      "png",
      "pdf"
    ]),

    allowedMimeTypes: new Set([
      "image/jpeg",
      "image/png",
      "application/pdf"
    ]),

    uploadEndpoint: "/api/upload"
  };

  const state = {
    file: null,
    processing: false,
    cancelled: false,
    outputBlob: null,
    outputName: "toolsfile-ocr.txt",
    objectUrl: null
  };

  const $ = (selector) => document.querySelector(selector);

  const elements = {
    form: $("#ocrForm"),
    fileInput: $("#fileInput"),
    uploadZone: $("#uploadZone"),
    selectedFile: $("#selectedFile"),
    selectedFileName: $("#selectedFileName"),
    removeFile: $("#removeFile"),

    processButton: $("#processButton"),
    cancelButton: $("#cancelButton"),

    progressSection: $("#progressSection"),
    progressTitle: $("#progressTitle"),
    progressPercent: $("#progressPercent"),
    progressBar: $("#progressBar"),
    progressTrack: $(".progress-track"),
    progressMessage: $("#progressMessage"),

    resultSection: $("#resultSection"),
    resultText: $("#resultText"),
    copyButton: $("#copyButton"),
    downloadButton: $("#downloadButton"),

    errorMessage: $("#errorMessage"),
    currentYear: $("#currentYear")
  };

  function showError(message) {
    if (!elements.errorMessage) return;

    elements.errorMessage.textContent = message;
    elements.errorMessage.hidden = false;
  }

  function clearError() {
    if (!elements.errorMessage) return;

    elements.errorMessage.textContent = "";
    elements.errorMessage.hidden = true;
  }

  function setProcessing(value) {
    state.processing = value;

    if (elements.processButton) {
      elements.processButton.disabled = value;
    }

    if (elements.cancelButton) {
      elements.cancelButton.hidden = !value;
    }

    if (elements.fileInput) {
      elements.fileInput.disabled = value;
    }
  }

  function setProgress(percent, title = "در حال پردازش...", message = "") {
    const safePercent = Math.max(
      0,
      Math.min(100, Number(percent) || 0)
    );

    if (elements.progressSection) {
      elements.progressSection.hidden = false;
    }

    if (elements.progressTitle) {
      elements.progressTitle.textContent = title;
    }

    if (elements.progressPercent) {
      elements.progressPercent.textContent = `${Math.round(safePercent)}٪`;
    }

    if (elements.progressBar) {
      elements.progressBar.style.width = `${safePercent}%`;
    }

    if (elements.progressTrack) {
      elements.progressTrack.setAttribute(
        "aria-valuenow",
        String(Math.round(safePercent))
      );
    }

    if (elements.progressMessage) {
      elements.progressMessage.textContent =
        message || "لطفاً تا پایان پردازش صبر کنید.";
    }
  }

  function resetProgress() {
    if (elements.progressSection) {
      elements.progressSection.hidden = true;
    }

    setProgress(0);
  }

  function getExtension(filename) {
    const cleanName = String(filename || "")
      .split(/[\\/]/)
      .pop()
      .trim()
      .toLowerCase();

    const parts = cleanName.split(".");

    if (parts.length < 2) {
      return "";
    }

    return parts.pop();
  }

  function validateFile(file) {
    if (!(file instanceof File)) {
      return {
        valid: false,
        message: "لطفاً یک فایل معتبر انتخاب کنید."
      };
    }

    if (!file.name || file.name.length > 255) {
      return {
        valid: false,
        message: "نام فایل معتبر نیست."
      };
    }

    if (file.size <= 0) {
      return {
        valid: false,
        message: "فایل خالی است و قابل پردازش نیست."
      };
    }

    if (file.size > CONFIG.maxFileSize) {
      return {
        valid: false,
        message: "حجم فایل نباید بیشتر از ۲۰ مگابایت باشد."
      };
    }

    const extension = getExtension(file.name);

    if (!CONFIG.allowedExtensions.has(extension)) {
      return {
        valid: false,
        message: "فرمت فایل پشتیبانی نمی‌شود. فقط JPG، PNG و PDF مجاز هستند."
      };
    }

    if (
      file.type &&
      !CONFIG.allowedMimeTypes.has(file.type.toLowerCase())
    ) {
      return {
        valid: false,
        message: "نوع واقعی فایل با فرمت انتخاب‌شده مطابقت ندارد."
      };
    }

    if (
      extension === "jpg" ||
      extension === "jpeg" ||
      extension === "png"
    ) {
      if (
        file.type &&
        !["image/jpeg", "image/png"].includes(file.type.toLowerCase())
      ) {
        return {
          valid: false,
          message: "فایل تصویر معتبر نیست."
        };
      }
    }

    if (extension === "pdf") {
      if (
        file.type &&
        file.type.toLowerCase() !== "application/pdf"
      ) {
        return {
          valid: false,
          message: "فایل PDF معتبر نیست."
        };
      }
    }

    return {
      valid: true,
      extension
    };
  }

  async function verifyFileSignature(file) {
    const extension = getExtension(file.name);

    if (!["jpg", "jpeg", "png", "pdf"].includes(extension)) {
      return false;
    }

    const buffer = await file.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (extension === "jpg" || extension === "jpeg") {
      return bytes[0] === 0xff &&
             bytes[1] === 0xd8 &&
             bytes[2] === 0xff;
    }

    if (extension === "png") {
      return (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    }

    if (extension === "pdf") {
      return (
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46 &&
        bytes[4] === 0x2d
      );
    }

    return false;
  }

  async function handleFile(file) {
    clearError();

    const validation = validateFile(file);

    if (!validation.valid) {
      showError(validation.message);
      return false;
    }

    try {
      const signatureValid = await verifyFileSignature(file);

      if (!signatureValid) {
        showError(
          "ساختار فایل معتبر نیست یا فایل با پسوند اعلام‌شده مطابقت ندارد."
        );
        return false;
      }
    } catch {
      showError("امکان بررسی فایل وجود ندارد. لطفاً فایل دیگری انتخاب کنید.");
      return false;
    }

    state.file = file;
    state.cancelled = false;

    if (elements.selectedFileName) {
      elements.selectedFileName.textContent = file.name;
    }

    if (elements.selectedFile) {
      elements.selectedFile.hidden = false;
    }

    if (elements.resultSection) {
      elements.resultSection.hidden = true;
    }

    return true;
  }

  function clearFile() {
    state.file = null;
    state.cancelled = false;
    state.outputBlob = null;

    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = null;
    }

    if (elements.fileInput) {
      elements.fileInput.value = "";
    }

    if (elements.selectedFile) {
      elements.selectedFile.hidden = true;
    }

    if (elements.resultSection) {
      elements.resultSection.hidden = true;
    }

    clearError();
    resetProgress();
  }

  function normalizeOcrText(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\u200c/g, " ")
      .trim();
  }

  function isCancelled() {
    return state.cancelled === true;
  }

  async function processImageWithOCR(file) {
    if (
      typeof window.Tesseract === "undefined" ||
      typeof window.Tesseract.recognize !== "function"
    ) {
      throw new Error(
        "کتابخانه OCR بارگذاری نشده است. لطفاً صفحه را دوباره بارگذاری کنید."
      );
    }

    setProgress(
      5,
      "در حال آماده‌سازی تصویر...",
      "تصویر برای OCR آماده می‌شود."
    );

    const result = await window.Tesseract.recognize(
      file,
      "fas+eng",
      {
        logger: (info) => {
          if (isCancelled()) {
            throw new DOMException(
              "پردازش توسط کاربر لغو شد.",
              "AbortError"
            );
          }

          if (!info || typeof info.progress !== "number") {
            return;
          }

          const percent = 10 + info.progress * 80;

          let title = "در حال پردازش OCR...";

          if (info.status === "recognizing text") {
            title = "در حال تشخیص متن...";
          }

          if (info.status === "loading language traineddata") {
            title = "در حال آماده‌سازی زبان OCR...";
          }

          setProgress(
            percent,
            title,
            "لطفاً تا پایان پردازش صبر کنید."
          );
        }
      }
    );

    if (isCancelled()) {
      throw new DOMException(
        "پردازش توسط کاربر لغو شد.",
        "AbortError"
      );
    }

    return normalizeOcrText(
      result?.data?.text || ""
    );
  }

  async function processPDF(file) {
    throw new Error(
      "برای OCR مستقیم PDF از ابزار PDF به متن استفاده کنید."
    );
  }

  async function processFile(file) {
    const extension = getExtension(file.name);

    if (extension === "pdf") {
      return processPDF(file);
    }

    return processImageWithOCR(file);
  }

  function createTextBlob(text) {
    return new Blob(
      ["\uFEFF" + text],
      {
        type: "text/plain;charset=utf-8"
      }
    );
  }

  function downloadBlob(blob, filename) {
    if (!(blob instanceof Blob)) {
      showError("فایل خروجی برای دانلود آماده نیست.");
      return;
    }

    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
    }

    state.objectUrl = URL.createObjectURL(blob);

    const anchor = document.createElement("a");

    anchor.href = state.objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => {
      if (state.objectUrl) {
        URL.revokeObjectURL(state.objectUrl);
        state.objectUrl = null;
      }
    }, 1500);
  }

  async function copyResult() {
    const text = elements.resultText?.value || "";

    if (!text.trim()) {
      showError("متنی برای کپی وجود ندارد.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);

      const original = elements.copyButton.innerHTML;

      elements.copyButton.innerHTML =
        '<i class="fa-solid fa-check"></i> کپی شد';

      window.setTimeout(() => {
        if (elements.copyButton) {
          elements.copyButton.innerHTML = original;
        }
      }, 1800);
    } catch {
      elements.resultText.focus();
      elements.resultText.select();

      try {
        document.execCommand("copy");
      } catch {
        showError(
          "کپی خودکار انجام نشد؛ متن را به‌صورت دستی کپی کنید."
        );
      }
    }
  }

  async function submitForm(event) {
    event.preventDefault();

    if (state.processing) {
      return;
    }

    clearError();

    if (!state.file) {
      showError("ابتدا یک فایل انتخاب کنید.");
      return;
    }

    const validation = validateFile(state.file);

    if (!validation.valid) {
      showError(validation.message);
      return;
    }

    state.cancelled = false;
    state.outputBlob = null;

    if (elements.resultSection) {
      elements.resultSection.hidden = true;
    }

    setProcessing(true);

    try {
      setProgress(
        1,
        "شروع پردازش...",
        "فایل شما در مرورگر آماده پردازش می‌شود."
      );

      const text = await processFile(state.file);

      if (isCancelled()) {
        throw new DOMException(
          "پردازش توسط کاربر لغو شد.",
          "AbortError"
        );
      }

      if (!text) {
        throw new Error(
          "متنی در تصویر پیدا نشد. لطفاً تصویر واضح‌تری انتخاب کنید."
        );
      }

      setProgress(
        94,
        "آماده‌سازی خروجی...",
        "متن استخراج‌شده در حال آماده‌سازی است."
      );

      state.outputBlob = createTextBlob(text);
      state.outputName =
        `toolsfile-ocr-${Date.now()}.txt`;

      if (elements.resultText) {
        elements.resultText.value = text;
      }

      setProgress(
        100,
        "پردازش با موفقیت انجام شد",
        "متن استخراج‌شده آماده دریافت است."
      );

      if (elements.resultSection) {
        elements.resultSection.hidden = false;
      }

      window.setTimeout(() => {
        elements.resultSection?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }, 100);

      if (
        typeof window.gtag === "function"
      ) {
        window.gtag(
          "event",
          "conversion_success",
          {
            tool_name: "ocr"
          }
        );
      }

    } catch (error) {

      if (
        error?.name === "AbortError" ||
        state.cancelled
      ) {
        showError("پردازش توسط شما لغو شد.");
      } else {
        showError(
          error?.message ||
          "خطایی هنگام پردازش فایل رخ داد. لطفاً دوباره تلاش کنید."
        );
      }

      if (
        typeof window.gtag === "function"
      ) {
        window.gtag(
          "event",
          "conversion_failed",
          {
            tool_name: "ocr"
          }
        );
      }

    } finally {
      setProcessing(false);
    }
  }

  function cancelProcessing() {
    if (!state.processing) {
      return;
    }

    state.cancelled = true;

    setProgress(
      0,
      "لغو شد",
      "پردازش توسط کاربر متوقف شد."
    );
  }

  function handleDrop(event) {
    event.preventDefault();

    elements.uploadZone?.classList.remove("dragover");

    const file = event.dataTransfer?.files?.[0];

    if (file) {
      handleFile(file);
    }
  }

  function handleDragOver(event) {
    event.preventDefault();

    elements.uploadZone?.classList.add("dragover");

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function handleDragLeave(event) {
    if (
      elements.uploadZone &&
      !elements.uploadZone.contains(event.relatedTarget)
    ) {
      elements.uploadZone.classList.remove("dragover");
    }
  }

  function setupAnalytics() {
    if (
      typeof window.gtag !== "function"
    ) {
      return;
    }

    elements.fileInput?.addEventListener(
      "change",
      () => {
        window.gtag(
          "event",
          "file_uploaded",
          {
            tool_name: "ocr"
          }
        );
      }
    );

    elements.processButton?.addEventListener(
      "click",
      () => {
        window.gtag(
          "event",
          "conversion_started",
          {
            tool_name: "ocr"
          }
        );
      }
    );

    elements.downloadButton?.addEventListener(
      "click",
      () => {
        window.gtag(
          "event",
          "file_downloaded",
          {
            tool_name: "ocr"
          }
        );
      }
    );
  }

  function init() {
    if (elements.currentYear) {
      elements.currentYear.textContent =
        String(new Date().getFullYear());
    }

    elements.fileInput?.addEventListener(
      "change",
      async (event) => {
        const file = event.target.files?.[0];

        if (file) {
          await handleFile(file);
        }
      }
    );

    elements.removeFile?.addEventListener(
      "click",
      clearFile
    );

    elements.form?.addEventListener(
      "submit",
      submitForm
    );

    elements.cancelButton?.addEventListener(
      "click",
      cancelProcessing
    );

    elements.copyButton?.addEventListener(
      "click",
      copyResult
    );

    elements.downloadButton?.addEventListener(
      "click",
      () => {
        if (!state.outputBlob) {
          showError("ابتدا فایل را پردازش کنید.");
          return;
        }

        downloadBlob(
          state.outputBlob,
          state.outputName
        );
      }
    );

    elements.uploadZone?.addEventListener(
      "dragover",
      handleDragOver
    );

    elements.uploadZone?.addEventListener(
      "dragleave",
      handleDragLeave
    );

    elements.uploadZone?.addEventListener(
      "drop",
      handleDrop
    );

    setupAnalytics();

    window.addEventListener(
      "beforeunload",
      () => {
        if (state.objectUrl) {
          URL.revokeObjectURL(state.objectUrl);
        }
      }
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );
  } else {
    init();
  }

  window.ToolsFile = Object.freeze({
    validateFile,
    downloadBlob,
    clearFile
  });

})();
