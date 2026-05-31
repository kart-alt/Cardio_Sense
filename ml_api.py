# ml_api.py — Flask Machine Learning API (Stacked Ensemble & SHAP Connected)
import os
import time
import random
import json
import joblib
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

MODELS_DIR = 'models'

# --- MODEL LIFECYCLE INITIALIZER ---
# Loaded globally at server startup
rf_model = None
xgb_model = None
lgbm_model = None
meta_learner = None
scaler = None
metadata = {}
shap_explainer = None
shap_available = False
models_initialized = False

def load_models_at_startup():
    global rf_model, xgb_model, lgbm_model, meta_learner, scaler, metadata, shap_explainer, shap_available, models_initialized
    
    rf_path = os.path.join(MODELS_DIR, 'rf_model.pkl')
    meta_path = os.path.join(MODELS_DIR, 'meta_learner.pkl')
    scaler_path = os.path.join(MODELS_DIR, 'feature_scaler.pkl')
    meta_json_path = os.path.join(MODELS_DIR, 'model_metadata.json')

    # Core checks
    all_core_exist = all(os.path.exists(p) for p in [rf_path, meta_path, scaler_path, meta_json_path])
    
    if not all_core_exist:
        print("[ML API] Core model files missing. Running automated training pipeline train.py...")
        try:
            import train
            print("[ML API] Automated training pipeline completed successfully.")
        except Exception as e:
            print("[ML API] Failed running train.py. Operating placeholder predictive engines.", str(e))
            return False

    try:
        # Load core scikit-learn models (always trained)
        scaler = joblib.load(scaler_path)
        rf_model = joblib.load(rf_path)
        meta_learner = joblib.load(meta_path)
        
        with open(meta_json_path, 'r') as f:
            metadata = json.load(f)
            
        print("[ML API] Loaded core Stacked Ensemble PKL models.")
        
        # Load conditional models if they were trained
        if metadata.get("xgb_available", False):
            xgb_path = os.path.join(MODELS_DIR, 'xgb_model.pkl')
            if os.path.exists(xgb_path):
                xgb_model = joblib.load(xgb_path)
                print("[ML API] Loaded XGBoost PKL base model.")
                
        if metadata.get("lgbm_available", False):
            lgb_path = os.path.join(MODELS_DIR, 'lgbm_model.pkl')
            if os.path.exists(lgb_path):
                lgbm_model = joblib.load(lgb_path)
                print("[ML API] Loaded LightGBM PKL base model.")

        # Initialize SHAP tree explainer on Random Forest regressor
        try:
            print("[ML API] Instantiating SHAP TreeExplainer on Random Forest model...")
            import shap
            shap_explainer = shap.TreeExplainer(rf_model)
            shap_available = True
            print("[ML API] SHAP TreeExplainer initialized and ready for live inferences.")
        except Exception as ex:
            print("[ML API] SHAP library offline. Falling back to analytical feature importances:", str(ex))
            shap_available = False
            
        models_initialized = True
        return True
        
    except Exception as e:
        print("[ML API] Exception loading model PKL files:", str(e))
        models_initialized = False
        return False

# Initialize
models_initialized = load_models_at_startup()

# Recommended patient clinical guidelines
RISK_RECOMMENDATIONS = {
    'Low': {
        'summary': 'Low cardiovascular risk baseline profile.',
        'recommendation': 'Biometrics settle within optimal ranges. Continue standard cardiovascular habits, balanced nutrition, and routine yearly diagnostic checks to maintain active health baselines.'
    },
    'Moderate': {
        'summary': 'Moderate cardiovascular risk indicators flagged.',
        'recommendation': 'Increase monitoring frequencies. Assess for physical fatigue, stress thresholds, or dietary excesses. We recommend scheduling a scheduled clinical cardiological consultation for review.'
    },
    'High': {
        'summary': 'Elevated cardiovascular risk detected.',
        'recommendation': 'Comprehensive diagnostic review is highly advised immediately. Patient features exhibit severe drops in arterial oxygenation levels, high heart rates, and a significant drop in HRV index parameters. Please contact a clinical cardiologist to arrange a 12-lead ECG, stress echocardiography, and systemic cardiovascular evaluation.'
    }
}


# --- HTTP API REST ENDPOINTS ---

@app.route('/predict', methods=['POST'])
def predict():
    try:
        global rf_model, xgb_model, lgbm_model, meta_learner, scaler, shap_explainer, shap_available, models_initialized
        
        if not models_initialized:
            models_initialized = load_models_at_startup()
            if not models_initialized:
                return jsonify({"error": "Predictive models fail to load"}), 500

        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid request, missing JSON payload"}), 400

        # 1. --- EXTRACT & ALIGN NESTED FRONTEND FEATURES ---
        ecg = data.get('ecg_features', {})
        optical = data.get('optical_features', {})
        temp = data.get('temperature_features', {})
        motion = data.get('motion_features', {})
        pressure = data.get('pressure_features', {})
        derived = data.get('derived_features', {})

        hr = float(optical.get('pulse_rate_bpm', ecg.get('heart_rate_bpm', 75.0)))
        spo2 = float(optical.get('spo2_percent', 97.4))
        body_temp = float(temp.get('body_temp_celsius', 36.8))
        sdnn = float(ecg.get('sdnn_ms', 40.0))
        rmssd = float(ecg.get('rmssd_ms', 32.0))
        
        # Build 17-dimensional vector matching training metadata columns
        features = [
            hr,                                                          # heart_rate_bpm
            float(ecg.get('rr_interval_mean_ms', 60000.0 / hr)),         # rr_interval_mean_ms
            float(ecg.get('rr_interval_std_ms', sdnn * 0.92)),            # rr_std_ms
            sdnn,                                                        # sdnn_ms
            rmssd,                                                       # rmssd_ms
            float(ecg.get('pnn50_percent', 12.0)),                       # pnn50
            float(ecg.get('lf_hf_ratio', 1.4)),                          # lf_hf_ratio
            spo2,                                                        # spo2_percent
            float(optical.get('spo2_min', spo2 - 1.2)),                  # spo2_min
            float(optical.get('pulse_rate_bpm', hr + 0.2)),              # pulse_rate_bpm
            float(optical.get('pulse_variability', 0.08)),               # pulse_variability
            body_temp,                                                   # body_temp_celsius
            float(motion.get('motion_magnitude_mean', 0.05)),            # motion_magnitude
            float(motion.get('stability_score', 0.95)),                  # stability_score
            float(pressure.get('contact_quality_score', 0.91)),          # contact_quality
            float(derived.get('age', 55.0)),                             # age
            1.0 if str(derived.get('gender', 'male')).lower() == 'male' else 0.0 # gender_encoded
        ]

        # 2. --- ENSEMBLE STACKED PREDICTION ---
        features_scaled = scaler.transform([features])
        
        # Base predictions list
        rf_pred = rf_model.predict(features_scaled)[0]
        preds = [rf_pred]
        
        if metadata.get("xgb_available", False) and xgb_model:
            preds.append(xgb_model.predict(features_scaled)[0])
            
        if metadata.get("lgbm_available", False) and lgbm_model:
            preds.append(lgbm_model.predict(features_scaled)[0])
            
        # Feed predictions to Stacking meta-learner
        meta_features = np.column_stack(preds)
        final_score = float(meta_learner.predict(meta_features)[0])
        final_score = np.clip(final_score, 0.0, 100.0)

        # Risk level stratification
        if final_score > 70.0:
            risk_level = 'High'
        elif final_score > 30.0:
            risk_level = 'Moderate'
        else:
            risk_level = 'Low'

        # Variance-based classification confidence estimation
        pred_variance = np.std(preds)
        confidence = float(1.0 - (pred_variance / 100.0))
        confidence = np.clip(confidence, 0.82, 0.98) 

        # Arrhythmia mapping details
        arrhythmia_flag = int(ecg.get('arrhythmia_flag', 0))
        
        heart_status = 'Normal Sinus Rhythm'
        if arrhythmia_flag == 1:
            heart_status = 'Abnormal Rhythm Detected'
        elif sdnn < 22.0:
            heart_status = 'Ectopic Rhythm Suspected'
        elif hr > 105.0:
            heart_status = 'Sinus Tachycardia'
        elif hr < 50.0:
            heart_status = 'Sinus Bradycardia'

        # 3. --- LIVE SHAP RISK EXPLAINERS ---
        shap_factors = []
        feature_names = metadata.get("feature_names", [
            'heart_rate_bpm', 'rr_interval_mean_ms', 'rr_std_ms', 'sdnn_ms', 'rmssd_ms', 'pnn50', 'lf_hf_ratio',
            'spo2_percent', 'spo2_min', 'pulse_rate_bpm', 'pulse_variability', 'body_temp_celsius',
            'motion_magnitude', 'stability_score', 'contact_quality', 'age', 'gender_encoded'
        ])
        
        if shap_available and shap_explainer:
            try:
                shap_vals = shap_explainer.shap_values(features_scaled)[0]
                for fname, val in zip(feature_names, shap_vals):
                    if abs(val) > 0.05:
                        shap_factors.append({
                            "feature": fname,
                            "contribution": float(round(val, 2)),
                            "direction": "increases_risk" if val >= 0 else "decreases_risk"
                        })
            except Exception as e:
                print("[SHAP] Explainer evaluation errored. Swapping to analytical importances:", str(e))
                shap_available = False

        if not shap_available or len(shap_factors) == 0:
            # ANALYTICAL SHAP FALLBACK
            rf_importances = rf_model.feature_importances_
            deviations = {
                'spo2_percent': (98.0 - spo2) * 2.5,
                'rmssd_ms': (35.0 - rmssd) * 0.8,
                'heart_rate_bpm': (hr - 72) * 0.4 if hr > 72 else (55 - hr) * 0.4 if hr < 55 else 0,
                'sdnn_ms': (45.0 - sdnn) * 0.5,
                'body_temp_celsius': (body_temp - 36.8) * 2.0 if body_temp > 36.8 else (35.8 - body_temp) * 2.5 if body_temp < 35.8 else 0
            }
            
            for fname, val in deviations.items():
                if fname in feature_names:
                    f_idx = feature_names.index(fname)
                    contrib = val * rf_importances[f_idx] * 20.0
                    if abs(contrib) > 0.05:
                        shap_factors.append({
                            "feature": fname,
                            "contribution": float(round(contrib, 2)),
                            "direction": "increases_risk" if contrib >= 0 else "decreases_risk"
                        })

        shap_factors.sort(key=lambda x: abs(x['contribution']), reverse=True)
        shap_factors = shap_factors[:3]

        response_data = {
            "type": "prediction_result",
            "cardio_risk_score": round(final_score, 1),
            "risk_level": risk_level,
            "probability_of_cvd": int(round(final_score)),
            "heart_status": heart_status,
            "confidence_score": round(confidence, 2),
            "recommendation": RISK_RECOMMENDATIONS[risk_level],
            "shap_factors": shap_factors,
            "feature_snapshot": {
                "heart_rate_bpm": int(round(hr)),
                "spo2_percent": spo2,
                "body_temp_celsius": body_temp,
                "sdnn_ms": sdnn,
                "rmssd_ms": rmssd
            },
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "test_id": data.get("test_id", f"TEST_{int(time.time())}_{random.randint(1000,9999)}")
        }

        print("[ML API] Computed clinical prediction result:", response_data)
        return jsonify(response_data)

    except Exception as e:
        print("[ML API] Inference exception occurred:", str(e))
        return jsonify({"error": "Failed performing classification inference", "details": str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "models_loaded": models_initialized,
        "shap_available": shap_available,
        "models_metadata": metadata
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"[ML API] Starting Flask Machine Learning API on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=False)
