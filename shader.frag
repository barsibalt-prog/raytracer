#version 330 core

const float MAX_DIST=600;
const float PI=3.14159265359;
const float AIRN=1.0;
const int BOX=0;
const int SPHERE=1;
const int PLANE=2;
const int SKY=3;
const int COORD=4;

const int FRONT=5;
const int LEFT=6;
const int RIGHT=7;
const int FLOOR=8;
const int ROOF=9;
const int LAMP=10;
const int DUST=11;


uniform float t;
uniform float camX;
uniform float camY;
uniform float camZ;
uniform int H;
uniform int W;
uniform float yaw;
uniform float pitch;
uniform sampler2D skyTexture;

uniform vec3 boxSize;
uniform vec3 boxCenter;
uniform vec3 angles;
uniform vec3 boxSize2;
uniform vec3 boxCenter2;
uniform vec3 angles2;
uniform vec3 sphCenter;
uniform vec4 plane;
float dens=1;

uniform sampler2D previousFrame;
uniform int frameCount;
uniform bool resetAccumulation;

out vec4 FragColor;

struct Rc{
    vec3 normal;
    vec3 p;
    int obj;
};
struct Material{
    vec3 color;
    float metallic;
    float ior;
    float mat;
    vec3 emi;
};
             //color,            met, ior,  mat, emi
Material materials[12]=Material[12](
    Material(vec3(0.2, 0.5, 0.9),0.5, 2.0,  0.05, vec3(0.0)), //box
    Material(vec3(0.7, 0.1, 0.0),0.5, 20,   0.7, vec3(0)), //sph
    Material(vec3(0.1, 0.8, 0.2),0.0, 1.0,  0.1, vec3(0.0)), //pla
    Material(vec3(0),            0.0, 1.0,  0.0, vec3(1.0)), //sky
    Material(vec3(0,0,0.5),      0.0, 1.0,  0.0, vec3(0.0)), //coord
    
    Material(vec3(0.9, 0.9, 0.7),0.5, 20,  1, vec3(0.0)), //front
    Material(vec3(0.0, 1.0, 0.0),0.5, 20,  1, vec3(0.0)), //left
    Material(vec3(1.0, 0.7, 0.0),0.5, 20,  1, vec3(0.0)), //right
    Material(vec3(0.9, 0.9, 0.7),0.5, 20,  1, vec3(0.0)), //floor
    Material(vec3(0.9, 0.9, 0.7),0.5, 20,  1, vec3(0.0)), //roof
    Material(vec3(0            ),0.0, 1.0, 0.1, vec3(10)), //lamp

    Material(vec3(0.5, 0.5, 0.5),0.0, 10.0,  0.0, vec3(0.0)) //dust
);


// float randf(float bias){
//     return fract(sin(t+gl_FragCoord.x*gl_FragCoord.y)*(5325.67+bias));
//     // равномерное [0, 1)
// }

float randf(int i) {
    uint seed = uint(gl_FragCoord.x) * 1973u
            + uint(gl_FragCoord.y) * 9277u
            + uint(fract(t) * 16777216.0)
            + uint(i)        * 675242u;
    seed |= 1u; // нечётным — важно для некоторых хэшей
    seed = seed * 747796405u + 2891336453u;
    uint word = ((seed >> ((seed >> 28u) + 4u)) ^ seed) * 277803737u;
    return float((word >> 22u) ^ word) / 4294967296.0;
}
vec3 randv3(int i, float m){
    return vec3(
        randf(i*3+0)-0.5,
        randf(i*3+1)-0.5,
        randf(i*3+2)-0.5
    ) * m;
}

// GGX: случайно выбирает нормаль микрофасетки.
// roughness: 0.0 = почти гладкая поверхность, 1.0 = шероховатая.
vec3 sampleGGXNormal(vec3 N, float roughness, int i) {
    float alpha = max(roughness * roughness, 0.001);
    float alpha2 = alpha * alpha;

    float u1 = randf(i * 13 + 101);
    float u2 = randf(i * 13 + 102);

    float phi = 2.0 * PI * u1;
    float cosTheta = sqrt(
        (1.0 - u2) /
        (1.0 + (alpha2 - 1.0) * u2)
    );
    float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));

    vec3 localH = vec3(
        sinTheta * cos(phi),
        sinTheta * sin(phi),
        cosTheta
    );

    // Переходим из локального базиса в мировое пространство.
    vec3 helper = abs(N.z) < 0.999
        ? vec3(0.0, 0.0, 1.0)
        : vec3(0.0, 1.0, 0.0);

    vec3 T = normalize(cross(helper, N));
    vec3 B = cross(N, T);

    return normalize(T * localH.x + B * localH.y + N * localH.z);
}

float ggxG1(float NoV, float alpha2) {
    NoV = max(NoV, 1e-6);

    return 2.0 * NoV /
        (NoV + sqrt(alpha2 + (1.0 - alpha2) * NoV * NoV));
}

float ggxReflectionWeight(vec3 V, vec3 L, vec3 N, vec3 H, float roughness) {
    float NoV = max(dot(N, V), 0.0);
    float NoL = max(dot(N, L), 0.0);
    float NoH = max(dot(N, H), 0.0);
    float VoH = abs(dot(V, H));

    if (NoV <= 0.0 || NoL <= 0.0 || NoH <= 1e-6)
        return 0.0;

    float alpha = max(roughness * roughness, 0.001);
    float alpha2 = alpha * alpha;

    float Gv = ggxG1(NoV, alpha2);
    float Gl = ggxG1(NoL, alpha2);

    return Gv * Gl * VoH / (NoV * NoH);
}



vec3 rotateX(vec3 p, float a)
{
    float s = sin(a);
    float c = cos(a);

    return vec3(
        p.x,
        c * p.y - s * p.z,
        s * p.y + c * p.z
    );
}
vec3 rotateY(vec3 p, float a)
{
    float s = sin(a);
    float c = cos(a);

    return vec3(
        c * p.x + s * p.z,
        p.y,
        c * p.z - s * p.x
    );
}
vec3 rotateZ(vec3 p, float a)
{
    float s = sin(a);
    float c = cos(a);

    return vec3(
        c * p.x - s * p.y,
        c * p.y + s * p.x,
        p.z
    );
}
vec3 rotate(vec3 v, vec3 a){
    return rotateZ(rotateY(rotateX(v,a.x),a.y),a.z);
}




float fresnel(
    vec3 rd,
    vec3 normal,
    float ior,
    out float etaI,
    out float etaT,
    out vec3 N){
    float cosi = clamp(dot(rd, normal), -1.0, 1.0);

    etaI = AIRN;
    etaT = ior;
    N = normal;

    if(cosi > 0.0){
        etaI = ior;
        etaT = AIRN;
        N = -normal;
        cosi = -cosi;
    }

    float r0 = (etaI - etaT) / (etaI + etaT);
    r0 *= r0;

    return r0 + (1.0 - r0) * pow(1.0 - abs(cosi), 5.0);
}



float IntersectSphere(vec3 ro,vec3 rd,vec3 center, float r){
    vec3 oc=ro-center;
    float b=dot(oc,rd);
    float c=dot(oc,oc)-r*r;
    float h=b*b-c;
    if(h<0)return -1;
    h=sqrt(h);
    float t=-b-h;
    if(t<0) return -b+h;
    return t;
}
float IntersectBox(vec3 ro,vec3 rd,vec3 rad, vec3 boxCenter,vec3 angles, out vec3 oN){
    // Перемещаем луч в локальные координаты куба
    vec3 ro_local = rotate(ro - boxCenter,-angles); 
    vec3 rd_local = rotate(rd,-angles);
    vec3 m = vec3(1) / rd_local;
    vec3 n = m * ro_local;
    vec3 k = abs(m) * rad;
    vec3 t1 = -n - k;
    vec3 t2 = -n + k;
    float tN =max(max(t1.x,t1.y),t1.z);
    float tF =min(min(t2.x,t2.y),t2.z);
    if(tN > tF) return -1;
    vec3 local_oN = -sign(rd_local)* step(t1.yzx,t1) * step(t1.zxy,t1);
    oN=rotate(local_oN,angles);
    if(tN<0) return tF;
    return tN;
}
float IntersectPlane(vec3 ro,vec3 rd,vec4 p, out vec3 oN){
    float denom = dot(rd, p.xyz);
    if (abs(denom) < 1e-6) return -1; // Луч параллелен плоскости
    float t = -(p.w + dot(ro, p.xyz)) / denom;
    if (t < 0) return -1; // Отбрасываем пересечения за камерой
    oN=normalize(p.xyz);
    return t;
}
float IntersectCoord(vec3 ro, vec3 rd){
    // Сетка лежит в XY, то есть z = 0

    float t = (-ro.z) / rd.z;
    if(t < 0) return -1;
    vec3 p = ro + rd * t;

    float dx = min(fract(p.x), 1.0 - fract(p.x));
    float dy = min(fract(p.y), 1.0 - fract(p.y));
    float d = min(dx, dy);

    float lineWidth = 0.03;
    if(d < lineWidth) return t;
    return -1;
}
vec3 getSky(vec3 rd){
    float u = atan(rd.x, rd.y) / (2.0 * PI) + 0.5;
    float v = asin(rd.z) / PI + 0.5;
    return texture(skyTexture, vec2(u,-v)).rgb;
}
vec3 getCheckersTexture(vec3 p, vec3 n){
    vec3 u = normalize(cross(n, vec3(0,1,0)));
    vec3 v = normalize(cross(n, u));

    float x = dot(p, u);
    float y = dot(p, v);

    int ix = abs(int(x));
    int iy = abs(int(y));

    return ((ix + iy) % 2 == 0)
        ? vec3(1.0)
        : vec3(0.0);
}


Rc raycast(vec3 ro, vec3 rd, int i){
    float minDist = MAX_DIST;
    Rc result;
    result.obj = SKY;

    vec3 floorN;
    float floorDist = IntersectPlane(ro, rd, vec4(0, 0, 1, 5), floorN);
    if(minDist > floorDist && floorDist > 0){
        vec3 p = ro + rd * floorDist;
        if(p.x >= -5.0 && p.x <= 5.0 && p.y >= -5.0 && p.y <= 5.0){
            result.p = p;
            result.normal = floorN;
            result.obj = FLOOR;
            minDist = floorDist;
        }
    }
    
    vec3 ceilN;
    float ceilDist = IntersectPlane(ro, rd, vec4(0, 0, -1, 5), ceilN);
    if(minDist > ceilDist && ceilDist > 0){
        vec3 p = ro + rd * ceilDist;
        if(p.x >= -5.0 && p.x <= 5.0 && p.y >= -5.0 && p.y <= 5.0){
            result.p = p;
            result.normal = ceilN;
            result.obj = ROOF;
            minDist = ceilDist;
        }
    }
    
    vec3 backN;
    float backDist = IntersectPlane(ro, rd, vec4(-1, 0, 0, 5), backN);
    if(minDist > backDist && backDist > 0){
        vec3 p = ro + rd * backDist;
        if(p.y >= -5.0 && p.y <= 5.0 && p.z >= -5.0 && p.z <= 5.0){
            result.p = p;
            result.normal = backN;
            result.obj = FRONT;
            minDist = backDist;
        }
    }
    
    vec3 leftN;
    float leftDist = IntersectPlane(ro, rd, vec4(0, -1, 0, 5), leftN);
    if(minDist > leftDist && leftDist > 0){
        vec3 p = ro + rd * leftDist;
        if(p.x >= -5.0 && p.x <= 5.0 && p.z >= -5.0 && p.z <= 5.0){
            result.p = p;
            result.normal = leftN;
            result.obj = LEFT;
            minDist = leftDist;
        }
    }
    
    vec3 rightN;
    float rightDist = IntersectPlane(ro, rd, vec4(0, 1, 0, 5), rightN);
    if(minDist > rightDist && rightDist > 0){
        vec3 p = ro + rd * rightDist;
        if(p.x >= -5.0 && p.x <= 5.0 && p.z >= -5.0 && p.z <= 5.0){
            result.p = p;
            result.normal = rightN;
            result.obj = RIGHT;
            minDist = rightDist;
        }
    }
    
    vec3 box1N;
    float box1Dist = IntersectBox(ro, rd, boxSize, boxCenter, angles, box1N);
    if(minDist > box1Dist && box1Dist > 0){
        result.p = ro + rd * box1Dist;
        result.normal = box1N;
        result.obj = BOX;
        minDist = box1Dist;
    }
    
    float sphDist = IntersectSphere(ro, rd, sphCenter, 2);
    if(minDist > sphDist && sphDist > 0){
        result.p = ro + rd * sphDist;
        result.normal = normalize(result.p - sphCenter);
        result.obj = SPHERE;
        minDist = sphDist;
    }
    
    vec3 lightN;
    float lightDist = IntersectPlane(ro, rd, vec4(0, 0, -1, 4.99), lightN);
    if(minDist > lightDist && lightDist > 0){
        vec3 p = ro + rd * lightDist;
        if(p.x >= -3 && p.x <= 3 && p.y >= -3 && p.y <= 3){
            result.p = p;
            result.normal = lightN;
            result.obj = LAMP;
            minDist = lightDist;
        }
    }

    // float dustDist=randf(i)*MAX_DIST/dens;
    // if(minDist > dustDist){
    //     vec3 p = ro + rd * dustDist;
    //     result.p = p;
    //     result.normal = normalize(randv3(i,1));
    //     result.obj = DUST;
    //     minDist = dustDist;
    // }
    

    return result;
}

vec3 raytrace(vec3 sro, vec3 srd){
    vec3 ro = sro;
    vec3 rd = srd;

    vec3 result = vec3(0.0);
    vec3 throughput = vec3(1.0);

    for(int i = 0; i < 8; i++){
        Rc rc = raycast(ro, rd, i);

        materials[PLANE].color = getCheckersTexture(rc.p, rc.normal);
        
        if(rc.obj == SKY){
            //result += throughput * getSky(rd);
            break;
        }

        Material material = materials[rc.obj];

        // Диффузный вклад
        // float diffuse = 1.0 - material.reflectable;

        // // Металл не имеет диффузного цвета
        // diffuse *= 1.0 - material.metallic;
        // result += throughput * material.color * diffuse;

        // Цвет отражения
        vec3 reflectionColor = mix(
            vec3(1.0),
            material.color,
            material.metallic
        );
        throughput *= reflectionColor;


        vec3 surfaceN = normalize(rc.normal);
        // Нормаль для смещения начала следующего луча.
        vec3 geomN = dot(rd, surfaceN) > 0.0
            ? -surfaceN
            : surfaceN;
        // material.mat теперь используется как roughness [0, 1].
        float roughness = clamp(material.mat, 0.02, 1.0);
        vec3 H = sampleGGXNormal(surfaceN, roughness, i);
        
        if (dot(rd, surfaceN) < 0.0 && dot(rd, H) >= -1e-4) {
            H = -H;
        } else if (dot(rd, surfaceN) > 0.0 && dot(rd, H) <= 1e-4) {
            H = -H;
        }

        float etaI;
        float etaT;
        vec3 N;

        float F = fresnel(
            rd,
            H,
            material.ior,
            etaI,
            etaT,
            N
        );

        float eta = etaI / etaT;
        float cosi = clamp(dot(rd, N), -1.0, 1.0);
        float k = 1.0 - eta * eta * (1.0 - cosi * cosi);

        // GGX меняет нормаль микроповерхности, относительно
        // которой рассчитываются отражение и преломление.
        if (k < 0.0 || randf(i * 23 + 7) < F) {
            vec3 V = -rd;
            vec3 L = normalize(reflect(rd, H));

            if (dot(L, N) <= 0.0) {
                break;
            }

            throughput *= ggxReflectionWeight(V, L, N, H, roughness);
            rd = L;
            ro = rc.p + N * 1e-3;
        } else {
            rd = normalize(
                eta * rd -
                (eta * cosi + sqrt(k)) * N
            );
            ro = rc.p - geomN * 1e-3;
        }

        result += throughput * material.emi;
    }

    return result;
}

void main(){
    // vec3 light=vec3(-3,0,6);
    // light=rotate(light,vec3(0,0,t));

    vec2 uv=gl_FragCoord.xy/vec2(W,H)*2-1;
    uv.x*=float(W)/float(H);
    vec3 ro=vec3(camX,camY,camZ); 
    // ro+=vec3(1,uv)*5;

    float visionRange=2;
    vec3 center=vec3(0);

    vec3 worldUp=vec3(0,0,1);
    vec3 forward = normalize(center - ro);

    vec3 right = normalize(cross(forward, worldUp));
    vec3 up = cross(right, forward);

    vec3 rd = normalize(
        forward * visionRange +
        right * uv.x +
        up * uv.y
    );


    // vec3 rd=normalize(vec3(visionRange,uv.x+1e-6,uv.y+1e-6));

    // rd=rotateY(rd,pitch);
    // rd=rotateZ(rd,yaw);

    vec3 currentColor = raytrace(ro, rd);


    vec3 previousColor = texture(
        previousFrame,
        gl_FragCoord.xy / vec2(W, H)
    ).rgb;

    vec3 averageColor;

    if (resetAccumulation || frameCount == 0) {
        averageColor = currentColor;
    } else {
        averageColor = previousColor + (currentColor - previousColor) / float(frameCount + 1);
    }

    FragColor = vec4(averageColor, 1.0);
}