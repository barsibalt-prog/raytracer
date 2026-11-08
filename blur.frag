#version 330 core

out vec4 FragColor;

uniform sampler2D image;
uniform vec2 direction;
uniform vec2 resolution;

const float PI = 3.14159265359;

const int KERNEL_SIZE = 32;
const float SIGMA_SPACE = 1;
const float SIGMA_COLOR = 4;

float gaussian(float x, float sigma) {
    return exp(-(x*x) / (2.0*sigma*sigma));
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 texel = direction / resolution;

    vec4 center = texture(image, uv);
    vec4 colorSum = vec4(0.0);
    float weightSum = 0.0;

    for (int i = -KERNEL_SIZE; i <= KERNEL_SIZE; i++) {
        vec2 sampleUV = uv + float(i) * texel;
        vec4 sampleColor = texture(image, sampleUV);

        float spatialDistance = abs(float(i));
        float colorDistance = length(sampleColor.rgb - center.rgb);

        float spatialWeight = gaussian(spatialDistance, SIGMA_SPACE);
        float colorWeight = gaussian(colorDistance, SIGMA_COLOR);

        float weight = spatialWeight * colorWeight;

        colorSum += sampleColor * weight;
        weightSum += weight;
    }

    FragColor = colorSum / max(weightSum, 10e-5);
}