const xRes = 512;
const yRes = 512;

let uv = new GPUImage(xRes,yRes);
for(let i = 0; i < xRes*yRes; i++)
{
    uv.r[i] = 0.5; //Math.max(Math.random()*2.0-1.0,0);
    uv.g[i] = Math.max(Math.random()*2.0-1.5,0);
}
uv.write();

const ep1 = 0.65 *0.2; 
const ep2 = 0.15 *0.2;
const b =  0.0035; //Feed Rate
const d =  0.0218 ;//0.1; //Kill Rate

const dT = 0.05;


setTimeout(()=>{
    generateTestImage(uv);
})

function draw()
{
    for(let i = 0; i < 500; i++)
    {
        update(uv);
    }
    render(uv);
    requestAnimationFrame(draw)
}

let updateProgram = createShaderProgram(generic_vs_code,
    `#version 300 es
    precision highp float;
    in vec2 v_position;

    uniform ivec2 size;

    uniform sampler2D uvTex;

    out vec4 FragColor;
    
    void main()
    {
        int ix = int(0.5*(v_position.x+1.0)*float(size.x));
        int iy = int(0.5*(v_position.y+1.0)*float(size.y));

        vec4 pix = texelFetch(uvTex,ivec2(ix,iy),0);

        vec4 laplacian = vec4(0.0,0.0,0.0,0.0);

        ivec2 offset = ivec2(1,0);
        for(int i = 0; i < 4; i++)
        {
            ivec2 offsetPos = ivec2(ix,iy)+offset;
            offsetPos = min(max(offsetPos,0),size-1);
            laplacian += texelFetch(uvTex,offsetPos,0)*0.25;
            offset = ivec2(-offset.y,offset.x);
        }
        laplacian -= pix;
        laplacian.a = 1.0;

        float r = 2.0*length(v_position)*length(v_position);
        float feedScalar = 0.05+1.3/(2.0*r*r*r*r+1.0) - 1.0/(16.0*r*r+1.0);

        float killScalar = 1.0 + max(pix.z,0.0)*2.0;



        float uOut = ${ep1}*laplacian.x/(feedScalar+1.0) + ${b}*(1.0-pix.x)*feedScalar - pix.x * pix.y * pix.y;
        float vOut = ${ep2}*laplacian.y - ${d}*pix.y * killScalar       + pix.x * pix.y * pix.y;

        pix.x += uOut*${dT};
        pix.y += vOut*${dT};
        pix.z += (-min(laplacian.y,0.0)*0.005+pix.y*0.0001-pix.z*0.001)*${dT}; 

        // pix = max(min(pix,1.0),0.0);

        pix.a = 1.0;

        FragColor = pix;
    }
    `
);



let updateSizeLoc = gl.getUniformLocation(updateProgram,"size");

gl.useProgram(updateProgram);

/**
 * @param {GPUImage} uv
 */
function update(uv)
{
    gl.viewport(0,0,uv.width,uv.height)
    
    gl.useProgram(updateProgram); 
    gl.uniform2i(updateSizeLoc,uv.width,uv.height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,uv.frontTex);

    gl.bindFramebuffer(gl.FRAMEBUFFER,uv.backFb);

    gl.drawArrays(gl.TRIANGLES,0,3);
    uv.swapBuffers()
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

            if(length(v_position-vec2(0.1,0.0)) < 0.05)
            {
                intensity = 1.0;
            }
            if(length(v_position-vec2(-0.1,0.0)) < 0.05)
            {
                intensity = 1.0;
            }
            if(length(v_position-vec2(0.0,0.07)) < 0.08)
            {
                intensity = 1.0;
            }
            if(length(v_position-vec2(0.0,-0.07)) < 0.08)
            {
                intensity = 1.0;
            }
            // if(length(v_position-vec2(0.05,0.0)) < 0.03)
            // {
            //     intensity = 1.0;
            // }
            // if(
            //     v_position.x < -0.1 && v_position.x > -0.15 &&
            //     v_position.y < 0.2 && v_position.y > -0.2
            // )
            // {
            //     intensity = -0.0015;
            // }

            if(intensity == 0.0)
            {
                FragColor = texture(input_tex0,0.5*(v_position+1.0));
            }
            else
            {
                FragColor = vec4(0.0,intensity,0.0,1.0);
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