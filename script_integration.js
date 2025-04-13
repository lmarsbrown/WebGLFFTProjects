const xRes = 1024;
const yRes = 1024;

let originalImage = new GPUImage(xRes,yRes);


let gradX = new GPUImage(xRes,yRes);
let gradY = new GPUImage(xRes,yRes);
originalImage.write();
originalImage.swapBuffers();
originalImage.write();
originalImage.swapBuffers();


load_img("flatmeower.jpg",(data)=>{
    console.log(data)
    // originalImage.writeImage(data);
    // fft(originalImage);
    // flipQuadrants(originalImage)

    let startTime = performance.now();
    generateTestImage(originalImage);
    fftLaplacian(originalImage,-1);
    
    for(let i = 0; i < 10; i++)
    {
        // generateTestImage(originalImage);
        // fftLaplacian(originalImage,-1);
    
        // copy(originalImage,gradX);
        // copy(originalImage,gradY);
        // fftGradient(gradX,0);
        // fftGradient(gradY,1);
        // combineGradients(gradX,gradY,originalImage)
    
    }
    let endTime = performance.now();
    // fftLaplacian(originalImage,-1);
    


    render(originalImage);
});


var FFTShaderProgram = createShaderProgram(generic_vs_code,loadText("fft.glsl"));


let FFT_input_tex_loc = gl.getUniformLocation(FFTShaderProgram,"input_tex");
let FFT_roots_loc = gl.getUniformLocation(FFTShaderProgram,"roots");
let FFT_direction_loc = gl.getUniformLocation(FFTShaderProgram,"direction");
let FFT_helix_size_loc = gl.getUniformLocation(FFTShaderProgram,"helix_size");
let FFT_resolution_loc = gl.getUniformLocation(FFTShaderProgram,"resolution");

var roots = new GPUImage(xRes,1);
var iRoots = new GPUImage(xRes,1);



//FFT
{
    {
        let rootsArr = genRoots(Math.log2(xRes));
    
        let irootsArr = genRoots(Math.log2(xRes),-1);
    
        for(let i = 0; i < xRes; i++)
        {
            roots.r[i] = rootsArr[i][0];
            roots.g[i] = rootsArr[i][1];
    
            iRoots.r[i] = irootsArr[i][0];
            iRoots.g[i] = irootsArr[i][1];
        }
        roots.write();
        iRoots.write();
    }
    
    function fft(image)
    {
        computeFFTPartial(image,roots,0);
        computeFFTPartial(image,roots,1);
        // flipQuadrants(image);
    }
    function ifft(image)
    {
        // flipQuadrants(image);
        computeFFTPartial(image,iRoots,0);
        computeFFTPartial(image,iRoots,1);
        // flipQuadrants(image);
    }
    
    function computeFFTPartial(image,rootsBuff,direction)
    {
        gl.useProgram(FFTShaderProgram);
    
        gl.uniform1i(FFT_input_tex_loc,0);
        gl.uniform1i(FFT_roots_loc,1);
        gl.uniform1i(FFT_direction_loc,direction);
        
    
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D,rootsBuff.frontTex);
        gl.activeTexture(gl.TEXTURE0);
    
        gl.uniform2i(FFT_resolution_loc,xRes,yRes);
        gl.viewport(0,0,xRes,yRes);
    
        let helix_size = 1;
        for(let i = 0; i < Math.log2(xRes); i++)
        {
            gl.uniform1i(FFT_helix_size_loc,helix_size);
    
            gl.bindTexture(gl.TEXTURE_2D,image.frontTex);
            gl.bindFramebuffer(gl.FRAMEBUFFER,image.backFb);
    
            gl.drawArrays(gl.TRIANGLES,0,3);
            helix_size *= 2;
            image.swapBuffers();
        }
    
    }
    function genRoots(order,direction = 1,scale = 1)
    {
        let roots = [];
        for(let i = 0; i < 2**order; i++)
        {
            let rote = -i*2*Math.PI/(2**order);
            rote %= 2*Math.PI;
            while(rote<0)
            {
                rote+=Math.PI*2;
            }
            if(rote > Math.PI)
            {
                rote = rote-2*Math.PI;
            }
            rote*=scale;
            roots.push([Math.cos(direction*rote),Math.sin(direction*rote)])
        }
        return roots;
    }
}
//Combine Gradients
{
    let combineGradientsProgram = createShaderProgram(generic_vs_code,
        `#version 300 es
        precision highp float;
        in vec2 v_position;
    
        uniform sampler2D input_tex0;
        uniform sampler2D input_tex1;
    
        out vec4 FragColor;
        
        void main()
        {
            vec4 pix0 = texture(input_tex0,0.5*(v_position+1.0));
            vec4 pix1 = texture(input_tex1,0.5*(v_position+1.0));

    
            FragColor = vec4(pix0.r,pix1.r,0.0,1.0);
        }
        `
    );
    
    gl.useProgram(combineGradientsProgram);
    gl.uniform1i(gl.getUniformLocation(combineGradientsProgram,"input_tex0"),0);
    gl.uniform1i(gl.getUniformLocation(combineGradientsProgram,"input_tex1"),1);
    
    
    /**
     * @param {GPUImage} input0
     * @param {GPUImage} input1
     * @param {GPUImage} output
     */
    function combineGradients(input0,input1,output)
    {
        gl.useProgram(combineGradientsProgram); 
        gl.viewport(0,0,output.width,output.height)
    
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D,input1.frontTex);
    
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D,input0.frontTex);
    
        gl.bindFramebuffer(gl.FRAMEBUFFER,output.backFb);
        gl.drawArrays(gl.TRIANGLES,0,3);
        output.swapBuffers()
    }
}
//Multiply Entrywise
{
    let multiplyEntrywiseProgram = createShaderProgram(generic_vs_code,
        `#version 300 es
        precision highp float;
        in vec2 v_position;
    
        uniform ivec2 size;
    
        uniform sampler2D input_tex0;
        uniform sampler2D input_tex1;
    
        out vec4 FragColor;
        
        void main()
        {
            vec4 pix0 = texture(input_tex0,0.5*(v_position+1.0));
            vec4 pix1 = texture(input_tex1,0.5*(v_position+1.0));
    
            vec2 outVal = vec2(
                pix0.x * pix1.x - pix0.y * pix1.y,
                pix0.x * pix1.y + pix0.y * pix1.x
            );
    
            FragColor = vec4(outVal,0.0,1.0);
        }
        `
    );
    
    let multiplyEntrywiseSizeLoc = gl.getUniformLocation(multiplyEntrywiseProgram,"size");
    
    gl.useProgram(multiplyEntrywiseProgram);
    gl.uniform1i(gl.getUniformLocation(multiplyEntrywiseProgram,"input_tex0"),0);
    gl.uniform1i(gl.getUniformLocation(multiplyEntrywiseProgram,"input_tex1"),1);
    
    
    /**
     * @param {GPUImage} input0
     * @param {GPUImage} input1
     * @param {GPUImage} output
     */
    function multiplyEntrywise(input0,input1,output)
    {
        gl.useProgram(multiplyEntrywiseProgram); 
        gl.viewport(0,0,output.width,output.height)
       
    
        gl.uniform2i(multiplyEntrywiseSizeLoc,input0.width,input0.height);
    
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D,input1.frontTex);
    
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D,input0.frontTex);
    
        gl.bindFramebuffer(gl.FRAMEBUFFER,output.backFb);
        gl.drawArrays(gl.TRIANGLES,0,3);
        output.swapBuffers()
    }
}

//Generate Laplacian Kernel
{
    var generateLaplacianKernelProgram = createShaderProgram(generic_vs_code,
        `#version 300 es
        precision highp float;
        in vec2 v_position;

        out vec4 FragColor;
        
        void main()
        {
            float r = sqrt(v_position.x*v_position.x+v_position.y*v_position.y); 
            float intensity = -0.5*log(r);
            if(r > 1.0)
            {
                // intensity = 0.0;
            }
            // float intensity = (1.0/1024.0)/(v_position.x*v_position.x+v_position.y*v_position.y);

            FragColor = vec4(intensity,0.0,0.0,1.0);
        }
        `
    );
    /**
     * 
     * @param {GPUImage} output
     */
    function generateLaplacianKernel(output)
    {
        gl.useProgram(generateLaplacianKernelProgram); 
        gl.viewport(0,0,output.width,output.height);
    
        gl.bindFramebuffer(gl.FRAMEBUFFER,output.backFb);

        gl.drawArrays(gl.TRIANGLES,0,3);
        output.swapBuffers()
    }
}


//Generate Test Image
{
    var generateTestImageProgram = createShaderProgram(generic_vs_code,
        `#version 300 es
        precision highp float;
        in vec2 v_position;
    
        out vec4 FragColor;
        uniform sampler2D input_tex0;
        
        void main()
        {
            float intensity = 0.0;
    
            // if(
            //     v_position.x > -1.0/${xRes}.0 && v_position.x < 1.0/${xRes}.0 &&
            //     v_position.y > -1.0/${xRes}.0 && v_position.y < 1.0/${xRes}.0
            // )
            // {
            //     intensity = 1.0;
            // }

            if(length(v_position-vec2(0.1,0.0)) < 0.1)
            {
                intensity = 0.001;
            }
            if(
                v_position.x < -0.1 && v_position.x > -0.15 &&
                v_position.y < 0.2 && v_position.y > -0.2
            )
            {
                intensity = -0.0015;
            }

            if(intensity == 0.0)
            {
                FragColor = texture(input_tex0,0.5*(v_position+1.0));
            }
            else
            {
                FragColor = vec4(intensity,0.0,0.0,1.0);
            }
        }
        `
    );
    /**
     * 
     * @param {GPUImage} output
     */
    function generateTestImage(output)
    {
        gl.useProgram(generateTestImageProgram); 
        gl.viewport(0,0,output.width,output.height);
       
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D,output.frontTex);
        gl.bindFramebuffer(gl.FRAMEBUFFER,output.backFb);
    
        gl.drawArrays(gl.TRIANGLES,0,3);
        output.swapBuffers()
    }
}

//Flip Quadrants
{

    var flipQuadrantsProgram = createShaderProgram(generic_vs_code,
        `#version 300 es
        precision highp float;
        in vec2 v_position;
    
        uniform ivec2 size;
    
        uniform sampler2D input_tex0;
    
        out vec4 FragColor;
        
        void main()
        {
            vec2 transformedPos = v_position;
            transformedPos.x = (1.0-abs(transformedPos.x))*sign(transformedPos.x);
            transformedPos.y = (1.0-abs(transformedPos.y))*sign(transformedPos.y);
            
            vec4 pixColor = texture(input_tex0,0.5*(transformedPos+1.0));
    
            FragColor = pixColor;
        }
        `
    );
    
    let flipQuadrantsSizeLoc = gl.getUniformLocation(flipQuadrantsProgram,"size");
    /**
     * @param {GPUImage} input
     */
    function flipQuadrants(input)
    {
        gl.useProgram(flipQuadrantsProgram); 
        gl.viewport(0,0,input.width,input.height)
       
    
        gl.uniform2i(flipQuadrantsSizeLoc,input.width,input.height);
    
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D,input.frontTex);
        gl.bindFramebuffer(gl.FRAMEBUFFER,input.backFb);
        gl.drawArrays(gl.TRIANGLES,0,3);
        input.swapBuffers()
    }
    
}

function convolve(input0,input1,output)
{

    fft(input0);
    fft(input1);

    multiplyEntrywise(input0,input1,output);

    if(input0 != output)
    {
        ifft(input0);
    }
    if(input1 != output)
    {
        ifft(input1);
    }
    ifft(output);
    flipQuadrants(output);
}

//Laplacian
{
    var fftLaplacianProgram = createShaderProgram(generic_vs_code,
        `#version 300 es
        precision highp float;
        in vec2 v_position;
    
        uniform ivec2 size;
        uniform int direction;
    
        uniform sampler2D input_tex0;
    
        out vec4 FragColor;
        
        void main()
        {
            int ix = int(0.5*(v_position.x+1.0)*float(size.x));
            int iy = int(0.5*(v_position.y+1.0)*float(size.y));
            
            vec4 pixVal = texelFetch(input_tex0,ivec2(ix,iy),0);

            float freqX = float(ix);
            if(ix > size.x/2)
            {
                freqX -= float(size.x);
            }

            float freqY = float(iy);
            if(iy > size.y/2)
            {
                freqY -= float(size.y);
            }

            vec2 outVal ;

            freqX /= float(size.x);
            freqY /= float(size.y);
            if(freqX !=0.0 || freqY != 0.0)
            {
                if(direction == 1)
                {
                    outVal = (pixVal.xy * (freqX * freqX + freqY * freqY) )*((2.0*3.1415926535*log(float(size.x))-1.0));
                }
                else
                {
                    outVal = (pixVal.xy / (freqX * freqX + freqY * freqY) )/((2.0*3.1415926535*log(float(size.x))-1.0));
                }
            }
            else
            {
                outVal = pixVal.xy;
            }
    
            FragColor = vec4(outVal,0.0,1.0);
        }
        `
    );
    
    let fftLaplacianSizeLoc = gl.getUniformLocation(fftLaplacianProgram,"size");
    let fftLaplacianDirectionLoc = gl.getUniformLocation(fftLaplacianProgram,"direction");
    /**
     * @param {GPUImage} input
     */
    function fftLaplacian(input,direction)
    {
        fft(input);
        gl.useProgram(fftLaplacianProgram); 
        gl.viewport(0,0,input.width,input.height)
       
    
        gl.uniform2i(fftLaplacianSizeLoc,input.width,input.height);
        gl.uniform1i(fftLaplacianDirectionLoc,direction);
    
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D,input.frontTex);
        gl.bindFramebuffer(gl.FRAMEBUFFER,input.backFb);
        gl.drawArrays(gl.TRIANGLES,0,3);
        input.swapBuffers()


        ifft(input);
    }
    
}
//gradient
{
    var fftGradientProgram = createShaderProgram(generic_vs_code,
        `#version 300 es
        precision highp float;
        in vec2 v_position;
    
        uniform ivec2 size;
        uniform int direction;
    
        uniform sampler2D input_tex0;
    
        out vec4 FragColor;
        
        void main()
        {
            int ix = int(0.5*(v_position.x+1.0)*float(size.x));
            int iy = int(0.5*(v_position.y+1.0)*float(size.y));
            
            vec4 pixVal = texelFetch(input_tex0,ivec2(ix,iy),0);

            float freqX = float(ix);
            if(ix > size.x/2)
            {
                freqX -= float(size.x);
            }

            float freqY = float(iy);
            if(iy > size.y/2)
            {
                freqY -= float(size.y);
            }

            freqX /= sqrt(float(size.x));
            freqY /= sqrt(float(size.y));

            vec2 outVal;

            if(direction == 0)
            {
                outVal = vec2(pixVal.y,-pixVal.x)*freqX;
            }
            else
            {
                outVal = vec2(pixVal.y,-pixVal.x)*freqY;
            }
    
            FragColor = vec4(outVal.xy,0.0,1.0);
        }
        `
    );
    
    let fftGradientSizeLoc = gl.getUniformLocation(fftGradientProgram,"size");
    let fftGradientDirectionLoc = gl.getUniformLocation(fftGradientProgram,"direction");
    /**
     * @param {GPUImage} input
     */
    function fftGradient(input,direction)
    {
        fft(input);
        gl.useProgram(fftGradientProgram); 
        gl.viewport(0,0,input.width,input.height)
       
    
        gl.uniform2i(fftGradientSizeLoc,input.width,input.height);
        gl.uniform1i(fftGradientDirectionLoc,direction);
    
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D,input.frontTex);
        gl.bindFramebuffer(gl.FRAMEBUFFER,input.backFb);
        gl.drawArrays(gl.TRIANGLES,0,3);
        input.swapBuffers()


        ifft(input);
    }
    
}


//Mirror
{

    var mirrorProgram = createShaderProgram(generic_vs_code,
        `#version 300 es
        precision highp float;
        in vec2 v_position;

        uniform sampler2D input_tex0;
    
        out vec4 FragColor;
        
        void main()
        {
            FragColor = texture(input_tex0,0.5*(-v_position+1.0));
        }
        `
    );
    
    /**
     * @param {GPUImage} input
     */
    function mirror(input)
    {
        gl.useProgram(mirrorProgram); 
        gl.viewport(0,0,input.width,input.height)
       
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D,input.frontTex);

        gl.bindFramebuffer(gl.FRAMEBUFFER,input.backFb);
        gl.drawArrays(gl.TRIANGLES,0,3);
        input.swapBuffers()
    }
    
}
