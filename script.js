const xRes = 1024;
const yRes = 1024;

let originalImage = new GPUImage(1024,1024);

load_img("flatmeower.jpg",(data)=>{
    console.log(data)
    originalImage.writeImage(data);

    greyscale(originalImage);

    fft(originalImage);
    // ifft(originalImage);

    render(originalImage)
});


var FFTShaderProgram = createShaderProgram(generic_vs_code,loadText("fft.glsl"));


let FFT_input_tex_loc = gl.getUniformLocation(FFTShaderProgram,"input_tex");
let FFT_roots_loc = gl.getUniformLocation(FFTShaderProgram,"roots");
let FFT_direction_loc = gl.getUniformLocation(FFTShaderProgram,"direction");
let FFT_helix_size_loc = gl.getUniformLocation(FFTShaderProgram,"helix_size");
let FFT_resolution_loc = gl.getUniformLocation(FFTShaderProgram,"resolution");

var roots = new GPUImage(1024,1);
var iRoots = new GPUImage(1024,1);

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
    flipQuadrants(originalImage);
}
function ifft(image)
{
    flipQuadrants(originalImage);
    computeFFTPartial(image,iRoots,0);
    computeFFTPartial(image,iRoots,1);
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
 * 
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