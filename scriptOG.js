function load_img(name,callback)
{
    let img_ele = document.createElement("img");
    img_ele.src = name;

    img_ele.onload = ()=>{
        let extractionCan = document.createElement("canvas");
        extractionCan.width = img_ele.width;
        extractionCan.height = img_ele.height;
        let extCtx = extractionCan.getContext("2d");
        extCtx.drawImage(img_ele,0,0);
        let channeled_data = extCtx.getImageData(0,0,img_ele.width,img_ele.height);

        callback(channeled_data.data);
    };
}

//Init gl
const x_resolution = 2048;
const y_resolution = 2048;
const width = x_resolution/2;
const height = y_resolution/2;


let can = document.createElement("canvas");
can.width = x_resolution;
can.height = y_resolution;
document.body.appendChild(can);

var gl = can.getContext("webgl2");
if (!gl.getExtension('EXT_color_buffer_float'))
    throw new Error('Rendering to floating point textures is not supported on this platform');


//Create FFT Shader
var FFTShaderProgram = createShaderProgram(generic_vs_code,loadText("fft.glsl"));
var inputShaderProgram = createShaderProgram(generic_vs_code,
    `#version 300 es
    precision highp float;
    in vec2 v_position;
    uniform sampler2D input_tex;

    out vec4 FragColor;
    
    void main()
    {
        int ix = int(0.5*(v_position.x+1.0)*float(${width}));
        int iy = int(0.5*(v_position.y+1.0)*float(${height}));

        vec4 out_color = texelFetch(input_tex,ivec2(ix,iy),0);
        float minVal = min(min(out_color.r,out_color.g),out_color.b);
        float maxVal = max(max(out_color.r,out_color.g),out_color.b);
        float magnitude = (out_color.r+out_color.g+out_color.b)/3.0;

        // if(magnitude < -1.0)
        // {
        //     magnitude = -1.0;
        // }

        FragColor = vec4(magnitude,magnitude,magnitude,1.0);
    }
    `
);
var transferShaderProgram = createShaderProgram(generic_vs_code,
    `#version 300 es
    precision highp float;
    in vec2 v_position;
    uniform sampler2D input_tex;
    uniform ivec2 resolution;

    out vec4 FragColor;
    
    void main()
    {
        int ix = int(0.5*(v_position.x+1.0)*float(resolution.x));
        int iy = int(0.5*(v_position.y+1.0)*float(resolution.y));

        vec4 out_color = texelFetch(input_tex,ivec2(ix,iy),0);
        FragColor = out_color;
    }
    `
);
var scrambleShaderProgram = createShaderProgram(generic_vs_code,
    `#version 300 es
    precision highp float;
    in vec2 v_position;
    uniform sampler2D input_tex;

    out vec4 FragColor;
    
    void main()
    {
        vec2 newPos = v_position;
        int nothing = 0;
        if(newPos.x>0.5)
        {
            newPos.x -= 0.5;
            newPos.x *= 2.0;
        }
        else if(newPos.x <-0.5)
        {
            newPos.x += 0.5;
            newPos.x *= 2.0;
        }
        else
        {
            newPos.x=0.0;
            nothing = 1;
        }

        if(newPos.y>0.5)
        {
            newPos.y -= 0.5;
            newPos.y *= 2.0;
        }
        else if(newPos.y <-0.5)
        {
            newPos.y += 0.5;
            newPos.y *= 2.0;
        }
        else
        {
            newPos.y=0.0;
            nothing = 1;
        }

        int ix = int(0.5*(newPos.x+1.0)*float(${width}));
        int iy = int(0.5*(newPos.y+1.0)*float(${height}));

        vec4 val0 = texelFetch(input_tex,ivec2(ix,iy),0);
        // vec4 val1 = texelFetch(input_tex,ivec2(ix+1,iy),0);
        // vec4 val2 = texelFetch(input_tex,ivec2(ix,iy+1),0);
        // vec4 val3 = texelFetch(input_tex,ivec2(ix+1,iy+1),0);

        // if(!(ix == 2*(ix/2) && iy == 2*(iy/2)))
        // {
        //     out_color = vec4(0.0,0.0,0.0,1.0);        
        // }

        if(nothing==1)
        {
            val0.x = 0.0;
        }

        val0 *= 2.0;
        val0 *= 4.0;

        val0 = round(val0);

        val0 /= 4.0;
        

        FragColor = val0;
    }
    `
);
var drawImgShaderProgram = createShaderProgram(generic_vs_code,
    `#version 300 es
    precision highp float;
    precision highp int;
    in vec2 v_position;
    uniform sampler2D input_tex;

    out vec4 FragColor;
    
    void main()
    {
        int ix = int(0.5*(v_position.x+1.0)*float(${x_resolution}));
        int iy = int(0.5*(-v_position.y+1.0)*float(${y_resolution}));

        float percentile = 0.0;


        vec4 pixelValue = texelFetch(input_tex,ivec2(ix,iy),0);

        float totalVal = 0.0;

        for(int dy = -1; dy < 2; dy++)
        {
            for(int dx = -1; dx < 2; dx++)
            {
                vec4 value = texelFetch(input_tex,ivec2(ix+dx,iy+dy),0);
                totalVal += value.r / (3.0 * 3.0);
                // if(value.r < pixelValue.r)
                // {
                //     percentile += 1.0/(3.0*3.0);
                // }
            }
        }



        float color = (pixelValue.r+1.0)*0.5;//2.0*totalVal-abs(totalVal-pixelValue.r);
        // if(percentile < 0.90)
        // {
        //     color = 0.0;
        // }
        FragColor = vec4(color,color,color,1.0);
    }
    `
);

var tex0 = createWriteableTexture(x_resolution,y_resolution);
var tex1 = createWriteableTexture(x_resolution,y_resolution);

var tex0_small = createWriteableTexture(width,width);
var tex1_small = createWriteableTexture(width,width);

var roots_tex = createTexture(x_resolution,1);
var inv_roots_tex = createTexture(x_resolution,1);

var roots_tex_small = createTexture(width,1);
var inv_roots_tex_small = createTexture(width,1);

create_quad(FFTShaderProgram)


var roots = genRoots(Math.log2(x_resolution),1,1);
var inv_roots = genRoots(Math.log2(x_resolution),-1,1);

var roots_array = new Float32Array(roots.length*4);
var inv_roots_array = new Float32Array(roots.length*4);
for(let i = 0; i < roots.length; i++)
{
    roots_array[4*i+0] = roots[i][0];
    roots_array[4*i+1] = roots[i][1];
    roots_array[4*i+3] = 1.0;

    inv_roots_array[4*i+0] = inv_roots[i][0];
    inv_roots_array[4*i+1] = inv_roots[i][1];
    inv_roots_array[4*i+3] = 1.0;
}


write_to_tex(roots_tex,roots_array,x_resolution,1);
write_to_tex(inv_roots_tex,inv_roots_array,x_resolution,1);

var roots_small = genRoots(Math.log2(width),1,1);
var inv_roots_small = genRoots(Math.log2(width),-1,1);

var roots_array_small = new Float32Array(roots_small.length*4);
var inv_roots_array_small = new Float32Array(roots_small.length*4);

for(let i = 0; i < roots_small.length; i++)
{
    roots_array_small[4*i+0] = roots_small[i][0];
    roots_array_small[4*i+1] = roots_small[i][1];
    roots_array_small[4*i+3] = 1.0;

    inv_roots_array_small[4*i+0] = inv_roots_small[i][0];
    inv_roots_array_small[4*i+1] = inv_roots_small[i][1];
    inv_roots_array_small[4*i+3] = 1.0;
}


write_to_tex(roots_tex_small,roots_array_small,width,1);
write_to_tex(inv_roots_tex_small,inv_roots_array_small,width,1);

let out;

load_img("flatmeower.jpg",main);

let test_data_0;

let valFreq = new Int32Array(303*4);
function main(img_data)
{
    gl.viewport(0,0,width,height);
    console.log(img_data)
    let gpu_input = new Float32Array(width*height*4);

    test_data_0 = [];
    for(let i = 0; i < width; i++)
    {
        test_data_0.push([(img_data[i*4]/256)*2-1,0]);
    }
    for(let i = 0; i < img_data.length/4; i++)
    {
        gpu_input[i*4+0] = ((img_data[i*4+0]/256)*2-1);
        gpu_input[i*4+1] = ((img_data[i*4+1]/256)*2-1) ;
        gpu_input[i*4+2] = ((img_data[i*4+2]/256)*2-1);
        gpu_input[i*4+3] = 1.0;
    }
    console.log("a: ",gpu_input)
    write_to_tex(tex1_small.tex, gpu_input, width, height);
    out = new Float32Array(x_resolution*y_resolution*4);



    
    gl.useProgram(inputShaderProgram);
    gl.bindTexture(gl.TEXTURE_2D,tex1_small.tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER,tex0_small.fb);
    gl.drawArrays(gl.TRIANGLES,0,3);

    compute_FFT(width,height,tex0_small,tex1_small,roots_tex_small,0);
    compute_FFT(width,height,tex0_small,tex1_small,roots_tex_small,1);



    gl.useProgram(scrambleShaderProgram);
    gl.viewport(0,0,x_resolution,y_resolution);
    gl.bindTexture(gl.TEXTURE_2D,tex0_small.tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER,tex0.fb);
    gl.drawArrays(gl.TRIANGLES,0,3);

    gl.readPixels(0,0,x_resolution,y_resolution,gl.RGBA,gl.FLOAT,out);

    for(let i = 0; i < out.length; i++)
    {
        valFreq[Math.abs(out[i*4+0]*4)]++;
        valFreq[Math.abs(out[i*4+1]*4)]++;
    }

    

    compute_FFT(x_resolution,y_resolution,tex0,tex1,inv_roots_tex,0);
    compute_FFT(x_resolution,y_resolution,tex0,tex1,inv_roots_tex,1);

    gl.useProgram(drawImgShaderProgram);
    gl.viewport(0,0,x_resolution,y_resolution);
    gl.bindTexture(gl.TEXTURE_2D,tex0.tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.drawArrays(gl.TRIANGLES,0,3);
    

    // console.log(out)
    // bottom_up_FFT(test_data_0);
    
}



function compute_FFT(x_res,y_res,tex_buf_0,tex_buf_1,roots_buf,direction)
{
    // gl.clearColor(1.0,0.0,1.0,1.0);
    // gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(FFTShaderProgram);

    let input_tex_loc = gl.getUniformLocation(FFTShaderProgram,"input_tex");
    let roots_loc = gl.getUniformLocation(FFTShaderProgram,"roots");
    let direction_loc = gl.getUniformLocation(FFTShaderProgram,"direction");

    gl.uniform1i(input_tex_loc,0);
    gl.uniform1i(roots_loc,1);
    gl.uniform1i(direction_loc,direction);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D,roots_buf);
    gl.activeTexture(gl.TEXTURE0);

    let helix_size_loc = gl.getUniformLocation(FFTShaderProgram,"helix_size");
    let resolution_loc = gl.getUniformLocation(FFTShaderProgram,"resolution");

    gl.uniform2i(resolution_loc,x_res,y_res);
    gl.viewport(0,0,x_res,y_res);

    let helix_size = 1;
    let tex_toggle = true;
    for(let i = 0; i < Math.log2(x_res); i++)
    {
        gl.uniform1i(helix_size_loc,helix_size);

        if(tex_toggle)
        {
            gl.bindTexture(gl.TEXTURE_2D,tex_buf_0.tex);
            gl.bindFramebuffer(gl.FRAMEBUFFER,tex_buf_1.fb);
        }
        else
        {
            gl.bindTexture(gl.TEXTURE_2D,tex_buf_1.tex);
            gl.bindFramebuffer(gl.FRAMEBUFFER,tex_buf_0.fb);
        }
        tex_toggle = !tex_toggle;
        gl.drawArrays(gl.TRIANGLES,0,3);
        helix_size *= 2;
    }
    // gl.readPixels(0,0,x_resolution,y_resolution,gl.RGBA,gl.FLOAT,out);
    gl.useProgram(transferShaderProgram);
    let transfer_resolution_loc = gl.getUniformLocation(transferShaderProgram,"resolution");
    gl.uniform2i(transfer_resolution_loc,x_res,y_res);

    if(!tex_toggle)
    {
        gl.bindTexture(gl.TEXTURE_2D,tex_buf_1.tex);
        gl.bindFramebuffer(gl.FRAMEBUFFER,tex_buf_0.fb);
        gl.drawArrays(gl.TRIANGLES,0,3);
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

function bottom_up_FFT(data)
{
    let passes = Math.log2(data.length);
    let roots = genRoots(passes,1.0);

    buffer = [];
    let helix_size = 1;
    for(let i = 0; i < passes; i++)
    {
        for(let j = 0; j < data.length; j++)
        {
            let helix_number = Math.floor(j/(helix_size*2));
            let helix_elem_ind = j%helix_size;
            let half =  Math.floor(j/helix_size)%2;

            let even_val = data[helix_number*helix_size+helix_elem_ind];
            let odd_val  = data[helix_number*helix_size+helix_elem_ind+data.length/2];
            let twist_val = roots[helix_elem_ind*roots.length/(helix_size*2)+half*roots.length/2];



            buffer[j] = sum(even_val,mul(odd_val,twist_val));
            buffer[j][0] /= 2;
            buffer[j][1] /= 2;
        }
        console.log(JSON.parse(JSON.stringify(buffer)))
        helix_size *= 2;
        for(let j = 0; j < data.length; j++){data[j][0] = buffer[j][0];data[j][1] = buffer[j][1];}
    }
}
function mul(a,b)
{
    return [a[0]*b[0]-a[1]*b[1], a[0]*b[1] + a[1]*b[0]];
}
function sum(a,b)
{
    return [a[0]+b[0],a[1]+b[1]];
}