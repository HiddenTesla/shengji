package shengji.exception;

import shengji.gui.ImageLabel;
import org.testng.Assert;
import org.testng.annotations.Test;

import javax.swing.*;

public class TestImageNotFound {

    private static final String IMAGE_DIRECTORY = ImageLabel.IMAGE_DIRECTORY;

    @Test
    public void TestImageFound() {
        ImageLabel image = new ImageLabel(new JFrame(),"sample.jpg");
    }

    @Test
    public void TestImageNotFound_() {
        try {
            ImageLabel image = new ImageLabel(new JFrame(), "not_such_file");
            Assert.fail();
        }
        catch (ImageNotFoundException e) {

        }
    }
}
