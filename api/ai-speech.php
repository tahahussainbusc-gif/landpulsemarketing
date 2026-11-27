<?php
require_once __DIR__ . '/_common.php';

lp_require_post();
$request = lp_read_json_body(12000);
$text = isset($request['text']) && is_string($request['text']) ? trim($request['text']) : '';
if ($text === '') {
    lp_json_response(400, array('error' => 'Speech text is required.'));
}
if (lp_text_length($text) > 2000) {
    lp_json_response(413, array('error' => 'Speech text is too long.'));
}
if (!defined('LP_GEMINI_API_KEY') || LP_GEMINI_API_KEY === '' || LP_GEMINI_API_KEY === 'PASTE_GEMINI_API_KEY_HERE') {
    lp_json_response(503, array('error' => 'Natural AI voice is not configured. Set Gemini key in api/config.php.'));
}

$model = defined('LP_GEMINI_TTS_MODEL') ? LP_GEMINI_TTS_MODEL : 'gemini-3.8-flash-lite-tts';
$voice = defined('LP_GEMINI_TTS_VOICE') ? LP_GEMINI_TTS_VOICE : 'Leda';
$payload = array(
    'model' => $model,
    'input' => array(array(
        'type' => 'user_input',
        'content' => array(array(
            'type' => 'text',
            'text' => $text,
            'annotations' => array(array(
                'type' => 'speech_metadata',
                'style' => 'A natural, warm female conversational voice with a gentle Pakistani Urdu accent. Speak clearly at a relaxed, human pace. Read meaningful numbers naturally. Do not vocalize punctuation, markdown, or decorative symbols.'
            ))
        ))
    )),
    'response_format' => array('type' => 'audio'),
    'generation_config' => array('speech_config' => array(array('voice' => $voice)))
);

try {
    $response = lp_http_request(
        'https://generativelanguage.googleapis.com/v1beta/interactions',
        array('x-goog-api-key: ' . LP_GEMINI_API_KEY, 'Content-Type: application/json'),
        $payload,
        'POST',
        60
    );
    if ($response['status'] < 200 || $response['status'] >= 300) {
        error_log('Gemini TTS returned HTTP ' . $response['status'] . '.');
        lp_json_response(502, array('error' => 'Natural voice could not be generated.'));
    }
    $result = lp_decode_provider_response($response);
} catch (Throwable $error) {
    error_log('Gemini TTS request failed: ' . $error->getMessage());
    lp_json_response(502, array('error' => 'Natural voice service is unavailable.'));
}

$audio = isset($result['output_audio']['data']) ? $result['output_audio']['data'] : '';
if ($audio === '' && isset($result['steps']) && is_array($result['steps'])) {
    foreach ($result['steps'] as $step) {
        if (!isset($step['type'], $step['content']) || $step['type'] !== 'model_output' || !is_array($step['content'])) {
            continue;
        }
        foreach ($step['content'] as $item) {
            if (isset($item['type'], $item['data']) && $item['type'] === 'audio') {
                $audio = $item['data'];
            }
        }
    }
}

$audioBytes = is_string($audio) ? base64_decode($audio, true) : false;
if ($audioBytes === false || $audioBytes === '') {
    lp_json_response(502, array('error' => 'Gemini did not return speech audio.'));
}
header('Content-Type: audio/wav');
header('Cache-Control: no-store');
header('Content-Length: ' . strlen($audioBytes));
echo $audioBytes;
