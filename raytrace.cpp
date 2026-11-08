#define SDL_MAIN_HANDLED
#include <glad/gl.h>
#include <SDL2/SDL.h>
#include <SDL2/SDL_image.h>
#include <stdio.h>

#include <fstream>
#include <sstream>
#include <string>
#include <algorithm>
#include <iostream>

// const int W = 500;
// const int H = 500;
const int W = 1920;
const int H = 1080;

GLuint accumFBO[2];
GLuint accumTexture[2];

GLuint blurFBO;
GLuint blurTexture;
GLuint blurProgram;

int readIndex = 0;
int writeIndex = 1;

int frameCount = 0;

float camX=-16;
float camY=0;
float camZ=0;
float yaw,pitch;
float speed=5;
float sensitivity=0.002f;

float vertices[]={
    -1.0f,-1.0f,
    -1.0f,3.0f,
    3.0f,-1.0f,
};

std::string loadShader(const char* fileName){
    std::ifstream file(fileName);
    if(!file.is_open()){
        printf("shader open error: ", fileName, '\n');
        return "";
    }
    std::stringstream buffer;
    buffer << file.rdbuf();
    std::string source= buffer.str();
    if(source.empty()){
        printf("shader empty error: ", fileName, '\n');
    }
    return source;
}

void initAccumulation(int W, int H){
    glGenFramebuffers(2, accumFBO);
    glGenTextures(2, accumTexture);

    for (int i = 0; i < 2; i++){
        // Создаём текстуру
        glBindTexture(GL_TEXTURE_2D, accumTexture[i]);

        glTexImage2D(
            GL_TEXTURE_2D,
            0,
            GL_RGBA16F,
            W, H,
            0,
            GL_RGBA,
            GL_HALF_FLOAT,
            nullptr
        );

        glTexParameteri(
            GL_TEXTURE_2D,
            GL_TEXTURE_MIN_FILTER,
            GL_NEAREST
        );

        glTexParameteri(
            GL_TEXTURE_2D,
            GL_TEXTURE_MAG_FILTER,
            GL_NEAREST
        );

        glTexParameteri(
            GL_TEXTURE_2D,
            GL_TEXTURE_WRAP_S,
            GL_CLAMP_TO_EDGE
        );

        glTexParameteri(
            GL_TEXTURE_2D,
            GL_TEXTURE_WRAP_T,
            GL_CLAMP_TO_EDGE
        );

        // Создаём framebuffer и подключаем текстуру
        glBindFramebuffer(GL_FRAMEBUFFER, accumFBO[i]);

        glFramebufferTexture2D(
            GL_FRAMEBUFFER,
            GL_COLOR_ATTACHMENT0,
            GL_TEXTURE_2D,
            accumTexture[i],
            0
        );

        if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE){
            printf("Framebuffer error: %d\n", i);
        }
    }

    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glBindTexture(GL_TEXTURE_2D, 0);
}

int main(){
    SDL_Init(SDL_INIT_VIDEO);

    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 3);
    SDL_GL_SetAttribute(
        SDL_GL_CONTEXT_PROFILE_MASK,
        SDL_GL_CONTEXT_PROFILE_CORE
    );

    SDL_Window* window = SDL_CreateWindow(
        "OpenGL test",
        SDL_WINDOWPOS_CENTERED,
        SDL_WINDOWPOS_CENTERED,
        W,
        H,
        SDL_WINDOW_OPENGL
    );

    if (!window) {
        printf("Window error: %s\n", SDL_GetError());
        return 1;
    }
    
    SDL_GLContext context = SDL_GL_CreateContext(window);

    if (!context) {
        printf("OpenGL context error: %s\n", SDL_GetError());
        return 1;
    }

    if (!gladLoadGL((GLADloadfunc)SDL_GL_GetProcAddress)) {
        printf("GLAD error\n");
        return 1;
    }

    SDL_SetRelativeMouseMode(SDL_TRUE);

    // Теперь OpenGL-функции уже загружены
    initAccumulation(W, H);


    glGenFramebuffers(1, &blurFBO);
    glGenTextures(1, &blurTexture);

    glBindTexture(GL_TEXTURE_2D, blurTexture);

    glTexImage2D(
        GL_TEXTURE_2D,
        0,
        GL_RGBA16F,
        W, H,
        0,
        GL_RGBA,
        GL_HALF_FLOAT,
        nullptr
    );

    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);

    glBindFramebuffer(GL_FRAMEBUFFER, blurFBO);

    glFramebufferTexture2D(
        GL_FRAMEBUFFER,
        GL_COLOR_ATTACHMENT0,
        GL_TEXTURE_2D,
        blurTexture,
        0
    );

    if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) {
        printf("Blur framebuffer error\n");
    }

    glBindFramebuffer(GL_FRAMEBUFFER, 0);


    printf("OpenGL: %s\n", glGetString(GL_VERSION));
    printf("GPU: %s\n", glGetString(GL_RENDERER));
    
    std::string vertexCode=loadShader("shader.vert");
    std::string fragmentCode=loadShader("shader.frag");

    const char* vertexSource=vertexCode.c_str();
    const char* fragmentSource=fragmentCode.c_str();

    GLuint vertexShader=glCreateShader(GL_VERTEX_SHADER);
    GLuint fragmentShader=glCreateShader(GL_FRAGMENT_SHADER);

    glShaderSource(vertexShader,1,&vertexSource,nullptr);
    glShaderSource(fragmentShader,1,&fragmentSource,nullptr);

    glCompileShader(vertexShader);
    glCompileShader(fragmentShader);


    std::string blurFragmentCode = loadShader("blur.frag");
    const char* blurFragmentSource = blurFragmentCode.c_str();

    GLuint blurVertexShader = glCreateShader(GL_VERTEX_SHADER);
    GLuint blurFragmentShader = glCreateShader(GL_FRAGMENT_SHADER);

    glShaderSource(blurVertexShader, 1, &vertexSource, nullptr);
    glShaderSource(blurFragmentShader, 1, &blurFragmentSource, nullptr);

    glCompileShader(blurVertexShader);
    glCompileShader(blurFragmentShader);

    // Проверяем компиляцию обоих шейдеров
    GLint success;
    char infoLog[1024];

    glGetShaderiv(blurVertexShader, GL_COMPILE_STATUS, &success);
    if (!success) {
        glGetShaderInfoLog(blurVertexShader, sizeof(infoLog), nullptr, infoLog);
        printf("BLUR VERTEX ERROR:\n%s\n", infoLog);
    }

    glGetShaderiv(blurFragmentShader, GL_COMPILE_STATUS, &success);
    if (!success) {
        glGetShaderInfoLog(blurFragmentShader, sizeof(infoLog), nullptr, infoLog);
        printf("BLUR FRAGMENT ERROR:\n%s\n", infoLog);
    }

    blurProgram = glCreateProgram();
    glAttachShader(blurProgram, blurVertexShader);
    glAttachShader(blurProgram, blurFragmentShader);
    glLinkProgram(blurProgram);

    glGetProgramiv(blurProgram, GL_LINK_STATUS, &success);
    if (!success) {
        glGetProgramInfoLog(blurProgram, sizeof(infoLog), nullptr, infoLog);
        printf("BLUR LINK ERROR:\n%s\n", infoLog);
    }

    glDeleteShader(blurVertexShader);
    glDeleteShader(blurFragmentShader);


    GLuint shaderProgram=glCreateProgram();

    glAttachShader(shaderProgram,vertexShader);
    glAttachShader(shaderProgram,fragmentShader);

    glLinkProgram(shaderProgram);

    glGetProgramiv(shaderProgram, GL_LINK_STATUS, &success);

    if (!success) {
        glGetProgramInfoLog(shaderProgram, 1024, nullptr, infoLog);
        printf("PROGRAM LINK ERROR:\n%s\n", infoLog);
    }

    glDeleteShader(vertexShader);
    glDeleteShader(fragmentShader);

    GLuint VAO,VBO;

    glGenVertexArrays(1,&VAO);
    glBindVertexArray(VAO);
    glGenBuffers(1,&VBO);
    glBindBuffer(GL_ARRAY_BUFFER,VBO);

    glBufferData(GL_ARRAY_BUFFER,sizeof(vertices),vertices,GL_STATIC_DRAW);

    glVertexAttribPointer(0,2,GL_FLOAT,GL_FALSE,2*sizeof(float),(void*)0);
    glEnableVertexAttribArray(0);

    if (!(IMG_Init(IMG_INIT_JPG) & IMG_INIT_JPG)) {
        printf("SDL_image error: %s\n", IMG_GetError());
        return 1;
    }

    SDL_Surface* surface = IMG_Load("sky.jpg");

    if (!surface)
    {
        printf("Error with image: %s\n", IMG_GetError());
        return 1;
    }

    SDL_Surface* rgbaSurface = SDL_ConvertSurfaceFormat(
        surface,
        SDL_PIXELFORMAT_RGBA32,
        0
    );

    SDL_FreeSurface(surface);

    if (!rgbaSurface)
    {
        printf("Convertation error: %s\n", SDL_GetError());
        return 1;
    }

    GLuint skyTexture;
    glGenTextures(1, &skyTexture);
    glBindTexture(GL_TEXTURE_2D, skyTexture);

    glTexImage2D(
        GL_TEXTURE_2D,
        0,
        GL_RGBA,
        rgbaSurface->w,
        rgbaSurface->h,
        0,
        GL_RGBA,
        GL_UNSIGNED_BYTE,
        rgbaSurface->pixels
    );

    glGenerateMipmap(GL_TEXTURE_2D);

    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);

    SDL_FreeSurface(rgbaSurface);

    GLint camXLocation=glGetUniformLocation(shaderProgram,"camX");
    GLint camYLocation=glGetUniformLocation(shaderProgram,"camY");
    GLint camZLocation=glGetUniformLocation(shaderProgram,"camZ");
    GLint timeLocation = glGetUniformLocation(shaderProgram, "t");
    GLint hLocation = glGetUniformLocation(shaderProgram, "H");
    GLint wLocation = glGetUniformLocation(shaderProgram, "W");
    GLint yawLocation = glGetUniformLocation(shaderProgram, "yaw");
    GLint pitchLocation = glGetUniformLocation(shaderProgram, "pitch");
    GLint skyTextureLocation = glGetUniformLocation(shaderProgram, "skyTexture");
    
    GLint boxSizeLocation = glGetUniformLocation(shaderProgram, "boxSize");
    GLint boxCenterLocation = glGetUniformLocation(shaderProgram, "boxCenter");
    GLint anglesLocation = glGetUniformLocation(shaderProgram, "angles");
    GLint boxSize2Location = glGetUniformLocation(shaderProgram, "boxSize2");
    GLint boxCenter2Location = glGetUniformLocation(shaderProgram, "boxCenter2");
    GLint angles2Location = glGetUniformLocation(shaderProgram, "angles2");
    GLint sphCenterLocation = glGetUniformLocation(shaderProgram, "sphCenter");
    GLint planeLocation = glGetUniformLocation(shaderProgram, "plane");
    
    glUseProgram(shaderProgram);

    glUniform1i(
        glGetUniformLocation(shaderProgram, "skyTexture"),
        0
    );

    glUniform1i(
        glGetUniformLocation(shaderProgram, "previousFrame"),
        1
    );

    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, skyTexture);
    glUniform1i(skyTextureLocation, 0);
    // glClearColor(0.1f, 0.1f, 0.3f, 1.0f);
    // glClear(GL_COLOR_BUFFER_BIT); 

    float x = 0.0f;
    float y = 0.0f;
    float z = 0.0f;
    float rotSpeed=0.1;

    bool running = true;
    SDL_Event event;

    Uint64 lastTime=SDL_GetPerformanceCounter();
    while (running) {
        int dx;
        int dy;
        const Uint8* keys=SDL_GetKeyboardState(nullptr);
        Uint64 currentTime=SDL_GetPerformanceCounter();
        float dt=(float)(currentTime-lastTime)/SDL_GetPerformanceFrequency();
        lastTime=currentTime;
        while (SDL_PollEvent(&event)) {
            if(event.type==SDL_MOUSEMOTION){
                yaw+=event.motion.xrel*sensitivity;
                pitch+=event.motion.yrel*sensitivity;
                frameCount = 0;
            }
            if (event.type == SDL_QUIT)
                running = false;
        }

        // 1. Выбираем текстуру для записи
        glBindFramebuffer(
            GL_FRAMEBUFFER,
            accumFBO[writeIndex]
        );

        glViewport(0, 0, W, H);

        // 2. Активируем твой шейдер
        glUseProgram(shaderProgram);

        // Небо — текстурный блок 0
        glActiveTexture(GL_TEXTURE0);
        glBindTexture(GL_TEXTURE_2D, skyTexture);

        // Предыдущий кадр — текстурный блок 1
        glActiveTexture(GL_TEXTURE1);
        glBindTexture(GL_TEXTURE_2D, accumTexture[readIndex]);

        glUniform1i(
            glGetUniformLocation(shaderProgram, "previousFrame"),
            1
        );

        glUniform1i(
            glGetUniformLocation(shaderProgram, "frameCount"),
            frameCount
        );

        glUniform1i(
            glGetUniformLocation(shaderProgram, "resetAccumulation"),
            frameCount == 0 ? GL_TRUE : GL_FALSE
        );

        
        if(keys[SDL_SCANCODE_ESCAPE]||keys[SDL_SCANCODE_LALT]) running = false;
        if(keys[SDL_SCANCODE_W]) {
            camX+=speed*dt;
            frameCount = 0;
        }
        if(keys[SDL_SCANCODE_S]) {
            camX-=speed*dt;
            frameCount = 0;
        }
        if(keys[SDL_SCANCODE_A]) {
            camY-=speed*dt;
            frameCount = 0;
        }
        if(keys[SDL_SCANCODE_D]) {
            camY+=speed*dt;
            frameCount = 0;
        }
        if(keys[SDL_SCANCODE_SPACE]) {
            camZ-=speed*dt;
            frameCount = 0;
        }
        if(keys[SDL_SCANCODE_LSHIFT]) {
            camZ+=speed*dt;
            frameCount = 0;
        }

        glActiveTexture(GL_TEXTURE0);
        glBindTexture(GL_TEXTURE_2D, skyTexture);

        float time = (SDL_GetTicks()) / 1000.0f;

        // if(x<1.57075){
        //     x+=dt*rotSpeed;
        // }else if(y<1.57075){
        //     y+=dt*rotSpeed;
        // }else{
        //     z+=dt*rotSpeed;
        // }

        glUseProgram(shaderProgram);
        glBindVertexArray(VAO);
        glUniform1f(camXLocation, camX);
        glUniform1f(camYLocation, camY);
        glUniform1f(camZLocation, camZ);
        glUniform1f(timeLocation, time);
        glUniform1f(yawLocation, yaw);
        glUniform1f(pitchLocation, pitch);
        glUniform1i(hLocation, H);
        glUniform1i(wLocation, W);
        
        glUniform3f(boxSizeLocation, 1,2,4);
        glUniform3f(boxCenterLocation, 0,2,-1);
        glUniform3f(anglesLocation, x,y,0.5);
        glUniform3f(boxSize2Location, 5,5,5);
        glUniform3f(boxCenter2Location, 10,-7,0);
        glUniform3f(angles2Location, x,y,z);
        glUniform3f(sphCenterLocation, -3,-2,-3);
        glUniform4f(planeLocation, 0,0,1,0);

        // 4. Рендерим полноэкранный треугольник
        glBindVertexArray(VAO);
        glDrawArrays(GL_TRIANGLES, 0, 3);

        // Первый проход: горизонтальное размытие
        glBindFramebuffer(GL_FRAMEBUFFER, blurFBO);
        glViewport(0, 0, W, H);

        glUseProgram(blurProgram);
        glBindVertexArray(VAO);

        glActiveTexture(GL_TEXTURE0);
        glBindTexture(GL_TEXTURE_2D, accumTexture[writeIndex]);

        glUniform1i(glGetUniformLocation(blurProgram, "image"), 0);
        glUniform2f(glGetUniformLocation(blurProgram, "direction"), 1.0f, 0.0f);
        glUniform2f(glGetUniformLocation(blurProgram, "resolution"),
                    (float)W, (float)H);

        glDrawArrays(GL_TRIANGLES, 0, 3);


        // Второй проход: вертикальное размытие
        glBindFramebuffer(GL_FRAMEBUFFER, 0);
        glViewport(0, 0, W, H);

        glUseProgram(blurProgram);

        glActiveTexture(GL_TEXTURE0);
        glBindTexture(GL_TEXTURE_2D, blurTexture);

        glUniform1i(glGetUniformLocation(blurProgram, "image"), 0);
        glUniform2f(glGetUniformLocation(blurProgram, "direction"), 0.0f, 1.0f);
        glUniform2f(glGetUniformLocation(blurProgram, "resolution"),
                    (float)W, (float)H);

        glDrawArrays(GL_TRIANGLES, 0, 3);

        // Меняем текстуры накопления местами
        std::swap(readIndex, writeIndex);

        frameCount++;

        SDL_GL_SwapWindow(window);

    }

    SDL_GL_DeleteContext(context);
    SDL_DestroyWindow(window);
    SDL_Quit();
    IMG_Quit();
    return 0;
}