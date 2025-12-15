//
const FLOW_URL = "https://46074bd623b7eb659325e9bd113c65.0f.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/bda71cf8487e4c298f99ce5c9134fed0/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=4qXzBpzzxtWIS-C4mRFd-Q6ZXx5WuCnu7MWujjHKXCk";
const FORM_SECRET = "my-secret-123";

// --- Wizard State Variables ---
let currentStep = 0;
const steps = [
    document.getElementById("step1"),
    document.getElementById("step2"),
    document.getElementById("step3"),
];
const totalSteps = steps.length;
const formEl = document.getElementById("appForm");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const backBtn = document.getElementById("backBtn");
const nextBtn = document.getElementById("nextBtn");
const submitBtn = document.getElementById("submitBtn");

// --- Utility Functions ---
function setStatus(message) {
  const statusEl = document.getElementById("status");
  if (statusEl) statusEl.textContent = message || "";
}

function setSubmitting(isSubmitting) {
  nextBtn.disabled = !!isSubmitting;
  backBtn.disabled = !!isSubmitting;
  submitBtn.disabled = !!isSubmitting;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read the selected file."));
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      if (commaIndex === -1) {
        reject(new Error("Unexpected file format while encoding."));
        return;
      }
      resolve(result.slice(commaIndex + 1));
    };
    reader.readAsDataURL(file);
  });
}

// --- Flow Submission Function (Modified) ---
async function postToFlow(payload) {
  //
  const resp = await fetch(FLOW_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-form-secret": FORM_SECRET
    },
    body: JSON.stringify(payload)
  });

  const text = await resp.text().catch(() => "");
  if (!resp.ok) throw new Error(`Flow error ${resp.status}: ${text || "No response body"}`);
  return text;
}

// --- Wizard Logic Functions ---

function updateUI() {
    steps.forEach((step, index) => {
        step.classList.remove("active");
        if (index === currentStep) {
            step.classList.add("active");
        }
    });

    // Update progress bar
    const progressPercent = ((currentStep + 1) / totalSteps) * 100;
    progressBar.style.width = `${progressPercent}%`;
    progressText.textContent = `Step ${currentStep + 1} of ${totalSteps}: ${steps[currentStep].querySelector('h2').textContent}`;

    // Update buttons
    backBtn.style.display = currentStep === 0 ? "none" : "block";
    
    if (currentStep === totalSteps - 1) {
        nextBtn.style.display = "none";
        submitBtn.style.display = "block";
    } else {
        nextBtn.style.display = "block";
        submitBtn.style.display = "none";
    }
}

function validateStep(stepIndex) {
    const currentStepEl = steps[stepIndex];
    const inputs = currentStepEl.querySelectorAll('input[required], select[required], textarea[required]');
    
    for (let input of inputs) {
        if (!input.value) {
            setStatus(`Please complete the required field: ${input.name}`);
            input.focus();
            return false;
        }
    }
    
    // Step-specific validation
    if (stepIndex === 0) {
        const yearsExpEl = formEl.elements["yearsExp"];
        const yearsExp = parseInt(yearsExpEl.value, 10);
        
        // JD's Knockout Rule: Must have at least 3 years of experience.
        if (isNaN(yearsExp) || yearsExp < 3) {
            setStatus("Minimum requirement not met: You must have at least 3 years of executive support experience.");
            yearsExpEl.focus();
            return false;
        }
    }

    if (stepIndex === 2) {
        const file = formEl.elements["resume"].files[0];
        if (!file) {
            setStatus("Please attach a resume.");
            return false;
        }

        const lower = (file.name || "").toLowerCase();
        const allowed = [".pdf", ".doc", ".docx"];
        if (!allowed.some((ext) => lower.endsWith(ext))) {
            setStatus("Resume must be a PDF, DOC, or DOCX file.");
            return false;
        }

        const maxBytes = 8 * 1024 * 1024; // 8MB
        if (file.size > maxBytes) {
            setStatus("Resume must be under 8MB.");
            return false;
        }
    }

    setStatus("");
    return true;
}

function nextPrev(n) {
    if (n === 1 && !validateStep(currentStep)) return false; 
    
    currentStep += n;
    
    if (currentStep >= totalSteps) {
        // If we reach the end, the submit event handler will fire
        return true; 
    }
    
    updateUI();
}

// --- Initialization ---

function init() {
    if (!formEl || totalSteps === 0) return;

    // Set up navigation buttons
    nextBtn.addEventListener("click", () => nextPrev(1));
    backBtn.addEventListener("click", () => nextPrev(-1));

    // Handle final submission only on the submit event
    formEl.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        // Final validation for step 3 (for safety)
        if (!validateStep(totalSteps - 1)) return; 
        
        setSubmitting(true);
        setStatus("Uploading resume and preparing data…");

        try {
            // 1. Gather all data from the form
            const file = formEl.elements["resume"].files[0];
            const resumeBase64 = await fileToBase64(file);

            const turnstileToken = document.querySelector('input[name="cf-turnstile-response"]')?.value || "";
            if (!turnstileToken) throw new Error("Please complete the Turnstile check.");

            // 2. Build the final payload with ALL screening data
            const payload = {
                email: String(formEl.elements["email"].value || "").trim(),
                fullName: String(formEl.elements["fullName"].value || "").trim(),
                phone: String(formEl.elements["phone"].value || "").trim(),
                yearsExp: parseInt(formEl.elements["yearsExp"].value, 10),  // NEW FIELD
                degree: String(formEl.elements["degree"].value || "").trim(),        // NEW FIELD
                reasonQuit: String(formEl.elements["reasonQuit"].value || "").trim(), // NEW FIELD
                resumeFileName: file.name,
                resumeBase64,
                turnstileToken
            };

            setStatus("Saving your application to SharePoint…");
            await postToFlow(payload);

            setStatus("Submitted successfully. Thank you!");
            formEl.reset();
            
            // Reset wizard to step 1
            currentStep = 0;
            updateUI();
            
            // Optional: reset Turnstile widget after success
            if (window.turnstile && typeof window.turnstile.reset === "function") {
                window.turnstile.reset();
            }

        } catch (err) {
            console.error(err);
            setStatus(err && err.message ? err.message : "Submission failed.");
        } finally {
            setSubmitting(false);
        }
    });

    // Start on the first step
    updateUI(); 
}

document.addEventListener("DOMContentLoaded", init);